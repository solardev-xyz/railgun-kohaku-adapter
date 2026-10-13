//! Evaluation only: public dummy notes, checkpoint restore and injected reads.
//! This is not an encrypted custody store or a transaction/recovery qualification.

use crate::{
    account::signer::{PrivateKeySigner, RailgunSigner},
    caip::AssetId,
    crypto::keys::{ByteKey, SpendingKey, ViewingKey},
    indexer::{
        indexed_account::IndexedAccountState,
        syncer::{SyncEvent, SyncerError, UtxoSyncer},
        utxo_indexer::{UtxoIndexer, UtxoIndexerState},
    },
    merkle_tree::{MerkleRoot, MerkleTreeVerifier},
    note::{Note, utxo::UtxoNote},
    poi::types::BlindedCommitmentType,
    railgun_database::RailgunDB,
};
use alloy::primitives::address;
use kohaku_kv_store::{Store, file::FileStore};
use std::{io, sync::Arc};

struct UnavailableSyncer;
#[async_trait::async_trait]
impl UtxoSyncer for UnavailableSyncer {
    async fn latest_block(&self) -> Result<u64, SyncerError> {
        Ok(65)
    }
    async fn sync(&self, _: u64, _: u64) -> Result<Vec<SyncEvent>, SyncerError> {
        Err(SyncerError::new(io::Error::other("Fixture unavailable")))
    }
}

struct NoNetworkVerifier;
#[async_trait::async_trait]
impl MerkleTreeVerifier for NoNetworkVerifier {
    async fn verify_root(
        &self,
        _: u32,
        _: u32,
        _: MerkleRoot,
    ) -> Result<bool, Box<dyn std::error::Error + Send + Sync>> {
        Err(Box::new(io::Error::other("Fixture forbids root reads")))
    }
}

async fn indexer(store: Store) -> UtxoIndexer {
    UtxoIndexer::new(
        store,
        Arc::new(UnavailableSyncer),
        Arc::new(NoNetworkVerifier),
    )
    .await
    .unwrap()
}

#[tokio::test]
async fn file_checkpoint_and_public_note_restore_without_network() {
    // Fixed public test keys, never funded. Preserve the scratch database.
    let signer = PrivateKeySigner::new_evm(
        SpendingKey::from_bytes([1; 32]),
        ViewingKey::from_bytes([2; 32]),
        1,
    );
    let other = PrivateKeySigner::new_evm(
        SpendingKey::from_bytes([3; 32]),
        ViewingKey::from_bytes([4; 32]),
        1,
    );
    let note = UtxoNote::new(
        0,
        0,
        signer.clone(),
        AssetId::erc20(address!("0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD")),
        10,
        [5; 16],
        "public fixture",
        BlindedCommitmentType::Shield,
    );
    let other_note = UtxoNote::new(
        0,
        1,
        other.clone(),
        AssetId::erc20(address!("0xDEADDEADDEADDEADDEADDEADDEADDEADDEADDEAD")),
        20,
        [6; 16],
        "second public fixture",
        BlindedCommitmentType::Shield,
    );
    let path = std::env::temp_dir().join(format!(
        "kohaku-public-checkpoint-{}-{}.redb",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    {
        let store = Store::new(FileStore::open(&path).unwrap());
        store
            .set_utxo_indexer(&UtxoIndexerState {
                synced_block: 64,
                trees: vec![],
            })
            .await
            .unwrap();
        store
            .set_account(
                &other.address(),
                &IndexedAccountState {
                    notes: vec![other_note.clone()],
                    synced_block: 64,
                    ..IndexedAccountState::default()
                },
            )
            .await
            .unwrap();
        store
            .set_account(
                &signer.address(),
                &IndexedAccountState {
                    notes: vec![note.clone()],
                    synced_block: 64,
                    ..IndexedAccountState::default()
                },
            )
            .await
            .unwrap();
    }
    {
        let store = Store::new(FileStore::open(&path).unwrap());
        let mut restored = indexer(store.clone()).await;
        assert!(restored.registered().is_empty());
        restored.register(signer.clone()).await.unwrap();
        restored.register(other.clone()).await.unwrap();
        let notes = restored.unspent(signer.address());
        assert_eq!(notes.len(), 1);
        assert_eq!(notes[0].hash, note.hash);
        assert_eq!(notes[0].value(), 10);
        let other_notes = restored.unspent(other.address());
        assert_eq!(other_notes.len(), 1);
        assert_eq!(other_notes[0].hash, other_note.hash);
        assert_eq!(other_notes[0].value(), 20);
        assert_ne!(notes[0].hash, other_notes[0].hash);
        assert_eq!(restored.synced_block(), 64);
        assert_eq!(
            store
                .get_account(&signer.address())
                .await
                .unwrap()
                .synced_block,
            64
        );
        assert!(restored.sync_to(65).await.is_err());
        assert_eq!(store.get_utxo_indexer().await.unwrap().synced_block, 64);
        assert_eq!(
            store.get_account(&signer.address()).await.unwrap().notes[0].hash,
            note.hash
        );
    }
    let store = Store::new(FileStore::open(&path).unwrap());
    let mut reopened = indexer(store).await;
    reopened.register(signer.clone()).await.unwrap();
    reopened.register(other.clone()).await.unwrap();
    assert_eq!(reopened.synced_block(), 64);
    assert_eq!(reopened.unspent(signer.address()).len(), 1);
    assert_eq!(reopened.unspent(signer.address())[0].hash, note.hash);
    assert_eq!(reopened.unspent(other.address()).len(), 1);
    assert_eq!(reopened.unspent(other.address())[0].hash, other_note.hash);
}
