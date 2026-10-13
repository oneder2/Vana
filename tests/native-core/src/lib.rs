#![allow(dead_code, unused_imports)]
extern crate self as tauri;
#[derive(Clone)]
pub struct AppHandle(pub std::path::PathBuf);
pub trait Manager {
    fn path(&self) -> PathResolver;
}
impl Manager for AppHandle {
    fn path(&self) -> PathResolver {
        PathResolver(self.0.clone())
    }
}
pub struct PathResolver(std::path::PathBuf);
impl PathResolver {
    pub fn app_data_dir(&self) -> anyhow::Result<std::path::PathBuf> {
        Ok(self.0.clone())
    }
}
#[path = "../../../src-tauri/src/db.rs"]
mod db;
#[path = "../../../src-tauri/src/export_file.rs"]
mod export_file;

#[cfg(test)]
mod regressions {
    use super::*;
    use db::*;
    fn app() -> AppHandle {
        AppHandle(std::env::temp_dir().join(format!("vana-core-{}", uuid::Uuid::new_v4())))
    }
    fn create(app: &AppHandle, scope: &str, kind: &str, parent: Option<&str>) -> DocumentRecord {
        create_document(
            app,
            scope,
            Some(kind.into()),
            false,
            Some(kind.into()),
            parent.map(str::to_string),
        )
        .unwrap()
    }
    fn save_supabase_session(
        app: &AppHandle,
        session: SupabaseSession,
    ) -> anyhow::Result<SupabaseSession> {
        let url = db::get_supabase_config(app)?.url.unwrap();
        db::save_supabase_session(app, session, &url, None)
    }
    fn session(id: &str) -> SupabaseSession {
        SupabaseSession {
            access_token: "test".into(),
            refresh_token: None,
            expires_at: None,
            token_type: None,
            user_id: Some(id.into()),
            email: None,
        }
    }
    fn input(d: &DocumentRecord, text: &str) -> SaveDocumentInput {
        SaveDocumentInput {content_generation:d.content_generation,account_scope:d.account_scope.clone(),id:d.id.clone(),title:text.into(),
            content_json:serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":text}]}]}).to_string(),plain_text:text.into(),tags:vec![text.into()]}
    }
    fn configure(app: &AppHandle) {
        save_supabase_config(
            app,
            SupabaseConfig {
                url: Some("https://example.supabase.co/".into()),
                anon_key: Some("test".into()),
            },
        )
        .unwrap();
    }
    fn restore_input(d: &DocumentRecord, history_id: &str) -> RestoreDocumentHistoryInput {
        RestoreDocumentHistoryInput {
            account_scope: d.account_scope.clone(), document_id: d.id.clone(),
            history_id: history_id.into(), content_generation: d.content_generation,
            expected_content_json: d.content_json.clone(),
        }
    }

    #[test]
    fn portable_backup_round_trip_copies_tree_tags_and_history_without_secrets_or_revision() {
        let app = app(); configure(&app);
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        let scope = get_app_state(&app).unwrap().account_scope;
        let folder = create(&app, &scope, "folder", None);
        let d = create(&app, &scope, "document", Some(&folder.id));
        let d = save_document(&app, input(&d, "portable body")).unwrap();
        let conn = open_db(&app).unwrap();
        conn.execute("UPDATE tags SET color='#123456'", []).unwrap();
        let json = export_space_backup(&app, &scope).unwrap();
        for secret_field in ["access_token", "refresh_token", "account_scope", "revision", "mutation_id", "last_pulled_at"] {
            assert!(!json.contains(secret_field));
        }
        let preview = preview_space_backup(&app, &scope, &json).unwrap();
        assert_eq!((preview.documents, preview.folders, preview.tags), (1, 1, 1));
        let result = import_space_backup(&app, &scope, &json).unwrap();
        assert_eq!((result.documents, result.folders), (1, 1));
        assert_eq!(result.retained_history, preview.retained_history);
        let copied = get_document(&app, result.first_document_id.as_deref().unwrap()).unwrap().unwrap();
        assert_ne!(copied.id, d.id);
        assert_ne!(copied.parent_id, d.parent_id);
        assert_eq!(copied.tags, d.tags);
        assert_eq!(copied.content_json, d.content_json);
        assert_eq!(copied.depth, d.depth);
        assert_eq!(copied.content_generation, 0);
        assert_eq!(list_tags(&app).unwrap()[0].color.as_deref(), Some("#123456"));
        let queued = export_sync_documents(&app, &scope).unwrap();
        assert!(queued.documents.iter().any(|x| x.id == copied.id && x.revision == 0));
        assert_eq!(list_document_history(&AppHandle(app.0.clone()), &scope, &copied.id).unwrap().len(), result.retained_history);
        // The snapshot is portable to another space only by explicit copy import.
        clear_supabase_session(&app, &scope).unwrap();
        assert!(preview_space_backup(&app, &scope, &json).is_err());
        assert!(import_space_backup(&app, &scope, &json).is_err());
        let guest_result = import_space_backup(&app, "guest", &json).unwrap();
        assert_ne!(guest_result.first_document_id, result.first_document_id);
        drop(conn); std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn backup_validation_rejects_corruption_and_illegal_trees_without_partial_writes() {
        let app = app();
        let folder = create(&app, "guest", "folder", None);
        let leaf = create(&app, "guest", "document", Some(&folder.id));
        let json = export_space_backup(&app, "guest").unwrap();
        let original: serde_json::Value = serde_json::from_str(&json).unwrap();
        let folder_index = original["documents"].as_array().unwrap().iter().position(|d| d["id"] == folder.id).unwrap();
        let leaf_index = original["documents"].as_array().unwrap().iter().position(|d| d["id"] == leaf.id).unwrap();
        let before = list_documents(&app, None).unwrap().len();
        let jobs = export_sync_documents(&app, "guest").unwrap().pending_job_ids;
        for mutation in 0..6 {
            let mut broken = original.clone();
            match mutation {
                0 => broken["documents"][leaf_index]["parent_id"] = serde_json::json!(uuid::Uuid::new_v4().to_string()),
                1 => broken["documents"][folder_index]["parent_id"] = serde_json::json!(folder.id),
                2 => broken["documents"][leaf_index]["status"] = serde_json::json!("trashed"),
                3 => broken["documents"][leaf_index]["id"] = broken["documents"][folder_index]["id"].clone(),
                4 => broken["documents"][leaf_index]["content_json"] = serde_json::json!("malformed"),
                _ => broken["refresh_token"] = serde_json::json!("unexpected secret"),
            }
            let broken = broken.to_string();
            assert!(preview_space_backup(&app, "guest", &broken).is_err(), "mutation {mutation}");
            assert!(import_space_backup(&app, "guest", &broken).is_err());
            assert_eq!(list_documents(&app, None).unwrap().len(), before);
            assert_eq!(export_sync_documents(&app, "guest").unwrap().pending_job_ids, jobs);
        }
        assert!(import_space_backup(&app, "guest", &json.chars().take(json.chars().count()/2).collect::<String>()).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn backup_import_rolls_back_all_records_on_outbox_failure_and_reports_history_retention() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        save_document(&app, input(&d, "backup me")).unwrap();
        let json = export_space_backup(&app, "guest").unwrap();
        let mut value: serde_json::Value = serde_json::from_str(&json).unwrap();
        value["history"][0]["created_at"] = serde_json::json!("2000-01-01T00:00:00Z");
        let aged = value.to_string();
        let preview = preview_space_backup(&app, "guest", &aged).unwrap();
        assert_eq!(preview.discarded_history, 1);
        let conn = open_db(&app).unwrap();
        conn.execute_batch("CREATE TRIGGER fail_import BEFORE INSERT ON sync_queue WHEN NEW.action='import-backup' BEGIN SELECT RAISE(ABORT,'injected import failure'); END;").unwrap();
        let count = list_documents(&app, None).unwrap().len();
        let jobs = export_sync_documents(&app, "guest").unwrap().pending_job_ids;
        assert!(import_space_backup(&app, "guest", &aged).is_err());
        assert_eq!(list_documents(&app, None).unwrap().len(), count);
        assert_eq!(export_sync_documents(&app, "guest").unwrap().pending_job_ids, jobs);
        conn.execute_batch("DROP TRIGGER fail_import").unwrap();
        let result = import_space_backup(&app, "guest", &aged).unwrap();
        assert_eq!(result.retained_history, preview.retained_history);
        drop(conn); std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn conflict_relations_survive_sync_ack_and_acknowledgement_keeps_both_bodies() {
        let app = app(); configure(&app);
        let d = create(&app, "guest", "document", None);
        let local = save_document(&app, input(&d, "local pending")).unwrap();
        apply_remote_documents(&app, "guest", vec![remote(&local, 2, "cloud body")]).unwrap();
        let rows = list_document_conflicts(&app, "guest").unwrap();
        assert_eq!(rows.len(), 1);
        let pair = get_document_conflict(&app, "guest", &rows[0].copy_id).unwrap();
        assert_eq!(pair.copy.content_json, local.content_json);
        assert_eq!(pair.original.unwrap().plain_text, "cloud body");
        let queued = export_sync_documents(&app, "guest").unwrap();
        let copy = queued.documents.iter().find(|x| x.id == rows[0].copy_id).unwrap().clone();
        let mut acknowledged = copy; acknowledged.revision = 3;
        finalize_sync_jobs(&app, "guest", &queued.pending_job_ids, &[acknowledged], true, None, None).unwrap();
        assert_eq!(list_document_conflicts(&app, "guest").unwrap().len(), 1);
        acknowledge_document_conflict(&app, "guest", &rows[0].copy_id).unwrap();
        assert!(list_document_conflicts(&app, "guest").unwrap().is_empty());
        assert_eq!(get_document(&app, &rows[0].copy_id).unwrap().unwrap().content_json, local.content_json);
        assert_eq!(get_document(&app, &d.id).unwrap().unwrap().plain_text, "cloud body");
        assert!(acknowledge_document_conflict(&app, "guest", &d.id).is_err());
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        assert!(list_document_conflicts(&app, "guest").is_err());
        assert!(get_document_conflict(&app, "guest", &rows[0].copy_id).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn existing_v3_space_gains_conflict_schema_without_changing_documents() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let conn = open_db(&app).unwrap();
        conn.execute_batch("DROP TABLE document_conflicts; PRAGMA user_version=3;").unwrap();
        drop(conn);
        assert!(list_document_conflicts(&app, "guest").unwrap().is_empty());
        assert_eq!(get_document(&app, &d.id).unwrap().unwrap().content_json, d.content_json);
        assert_eq!(open_db(&app).unwrap().pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0)).unwrap(), 4);
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn restore_preserves_metadata_and_current_body_survives_reopen_and_sync() {
        let app = app();
        let folder = create(&app, "guest", "folder", None);
        let d = create(&app, "guest", "document", Some(&folder.id));
        let old = save_document(&app, input(&d, "old body")).unwrap();
        let history_id = list_document_history(&app, "guest", &d.id).unwrap()[0].id.clone();
        let current = save_document(&app, input(&old, "current body")).unwrap();
        let restored = restore_document_history(&app, restore_input(&current, &history_id)).unwrap();
        assert_eq!(restored.title, current.title);
        assert_eq!(restored.tags, current.tags);
        assert_eq!(restored.parent_id, current.parent_id);
        assert_eq!(restored.content_json, old.content_json);
        assert_eq!(restored.plain_text, "old body");
        assert_eq!(restored.content_generation, current.content_generation + 1);
        assert!(list_document_history(&app, "guest", &d.id).unwrap().iter().any(|h| h.content_json == current.content_json));
        let reopened = AppHandle(app.0.clone());
        assert_eq!(get_document(&reopened, &d.id).unwrap().unwrap().content_json, old.content_json);
        let snapshot = export_sync_documents(&reopened, "guest").unwrap();
        assert_eq!(snapshot.documents.iter().find(|x| x.id == d.id).unwrap().content_json, old.content_json);
        // An acknowledgement for the restore cannot remove an edit queued after it.
        let edited = save_document(&app, input(&restored, "edited after restore")).unwrap();
        finalize_sync_jobs(&app, "guest", &snapshot.pending_job_ids, &[remote(&restored, 1, "old body")], true, None, None).unwrap();
        assert!(!export_sync_documents(&app, "guest").unwrap().pending_job_ids.is_empty());
        assert_eq!(get_document(&app, &d.id).unwrap().unwrap().content_json, edited.content_json);
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn restore_rejects_local_remote_expired_cross_document_and_account_races() {
        let app = app(); configure(&app);
        let d = create(&app, "guest", "document", None);
        let old = save_document(&app, input(&d, "old")).unwrap();
        let history = list_document_history(&app, "guest", &d.id).unwrap()[0].id.clone();
        let preview = save_document(&app, input(&old, "preview")).unwrap();
        let local = save_document(&app, input(&preview, "late local")).unwrap();
        assert_eq!(preview.content_generation, local.content_generation);
        assert!(restore_document_history(&app, restore_input(&preview, &history)).unwrap_err().to_string().contains("预览"));
        let jobs = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(&app, "guest", &jobs.pending_job_ids, &[remote(&local, 1, "late local")], true, None, None).unwrap();
        apply_remote_documents(&app, "guest", vec![remote(&local, 2, "cloud")]).unwrap();
        assert!(restore_document_history(&app, restore_input(&local, &history)).is_err());
        let cloud = get_document(&app, &d.id).unwrap().unwrap();
        let other = create(&app, "guest", "document", None);
        let other_history = list_document_history(&app, "guest", &other.id).unwrap()[0].id.clone();
        assert!(restore_document_history(&app, restore_input(&cloud, &other_history)).is_err());
        for n in 0..22 { save_document(&app, input(&cloud, &format!("evict {n}"))).unwrap(); }
        let latest = get_document(&app, &d.id).unwrap().unwrap();
        assert!(restore_document_history(&app, restore_input(&latest, &history)).is_err());
        let available = list_document_history(&app, "guest", &d.id).unwrap()[1].id.clone();
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        assert!(restore_document_history(&app, restore_input(&latest, &available)).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn failed_restore_rolls_back_body_generation_history_and_outbox() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let old = save_document(&app, input(&d, "old")).unwrap();
        let history_id = list_document_history(&app, "guest", &d.id).unwrap()[0].id.clone();
        let current = save_document(&app, input(&old, "current")).unwrap();
        let before = export_sync_documents(&app, "guest").unwrap();
        let histories = list_document_history(&app, "guest", &d.id).unwrap();
        let conn = open_db(&app).unwrap();
        conn.execute_batch("CREATE TRIGGER fail_restore BEFORE INSERT ON sync_queue WHEN NEW.action='restore-history' BEGIN SELECT RAISE(ABORT,'injected outbox failure'); END;").unwrap();
        assert!(restore_document_history(&app, restore_input(&current, &history_id)).is_err());
        let after = get_document(&app, &d.id).unwrap().unwrap();
        assert_eq!(after.content_json, current.content_json);
        assert_eq!(after.content_generation, current.content_generation);
        assert_eq!(after.updated_at, current.updated_at);
        assert_eq!(export_sync_documents(&app, "guest").unwrap().pending_job_ids, before.pending_job_ids);
        assert_eq!(list_document_history(&app, "guest", &d.id).unwrap().iter().map(|h| &h.id).collect::<Vec<_>>(), histories.iter().map(|h| &h.id).collect::<Vec<_>>());
        conn.execute_batch("DROP TRIGGER fail_restore;").unwrap();
        restore_document_history(&app, restore_input(&current, &history_id)).unwrap();
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        permanently_delete_document(&app, "guest", &d.id).unwrap();
        assert!(restore_document_history(&app, restore_input(&current, &history_id)).is_err());
        drop(conn);
        std::fs::remove_dir_all(app.0).unwrap();
    }
    fn remote(d: &DocumentRecord, revision: i64, text: &str) -> SyncDocumentRecord {
        SyncDocumentRecord {
            revision,
            mutation_id: String::new(),
            is_purged: false,
            id: d.id.clone(),
            title: text.into(),
            node_kind: d.node_kind.clone(),
            parent_id: d.parent_id.clone(),
            depth: d.depth,
            content_json: input(d, text).content_json,
            plain_text: text.into(),
            status: d.status.clone(),
            is_favorite: false,
            is_template: false,
            created_at: d.created_at.clone(),
            updated_at: d.updated_at.clone(),
            archived_at: None,
            deleted_at: None,
            tags: vec![text.into()],
        }
    }
    #[test]
    fn reading_and_identical_saves_do_not_change_timestamp_outbox_or_history() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let d = save_document(&app, input(&d, "kept content")).unwrap();
        let before = export_sync_documents(&app, "guest").unwrap();
        let history = list_document_history(&app, "guest", &d.id).unwrap();
        for _ in 0..3 {
            let read = get_document(&app, &d.id).unwrap().unwrap();
            let mut unchanged = input(&read, "kept content");
            unchanged.content_json = serde_json::to_string_pretty(
                &serde_json::from_str::<serde_json::Value>(&read.content_json).unwrap()).unwrap();
            unchanged.tags = vec![" kept content ".into(), "kept content".into()];
            let saved = save_document(&app, unchanged).unwrap();
            assert_eq!(saved.updated_at, d.updated_at);
        }
        assert_eq!(export_sync_documents(&app, "guest").unwrap().pending_job_ids, before.pending_job_ids);
        assert_eq!(list_document_history(&app, "guest", &d.id).unwrap().len(), history.len());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn history_observes_cloud_changes_without_queueing_writes_and_is_account_scoped() {
        let app = app();
        configure(&app);
        let d = create(&app, "guest", "document", None);
        let d = save_document(&app, input(&d, "local version")).unwrap();
        let first = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(&app, "guest", &first.pending_job_ids, &[remote(&d, 1, "local version")], true, None, None).unwrap();
        apply_remote_documents(&app, "guest", vec![remote(&d, 2, "cloud version")]).unwrap();
        let entries = list_document_history(&app, "guest", &d.id).unwrap();
        assert!(entries[0].content_json.contains("cloud version"));
        assert!(entries.iter().any(|entry| entry.content_json.contains("local version")));
        assert!(export_sync_documents(&app, "guest").unwrap().pending_job_ids.is_empty());
        apply_remote_documents(&app, "guest", vec![remote(&d, 2, "cloud version")]).unwrap();
        assert_eq!(list_document_history(&app, "guest", &d.id).unwrap().len(), entries.len());
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        assert!(list_document_history(&app, "guest", &d.id).is_err());
        let scope = get_app_state(&app).unwrap().account_scope;
        assert!(list_document_history(&app, &scope, &d.id).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn history_is_bounded_and_purged_documents_cannot_be_read() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        for n in 0..24 { save_document(&app, input(&d, &format!("version {n}"))).unwrap(); }
        let entries = list_document_history(&app, "guest", &d.id).unwrap();
        assert_eq!(entries.len(), 20);
        assert!(entries[0].content_json.contains("version 23"));
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        permanently_delete_document(&app, "guest", &d.id).unwrap();
        assert!(list_document_history(&app, "guest", &d.id).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn accounts_projects_and_guest_have_separate_data_and_late_work_is_rejected() {
        let app = app();
        configure(&app);
        let guest = create(&app, "guest", "document", None);
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        let a = get_app_state(&app).unwrap().account_scope;
        assert!(list_documents(&app, None).unwrap().is_empty());
        let doc = create(&app, &a, "document", None);
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000002")).unwrap();
        let b = get_app_state(&app).unwrap().account_scope;
        assert_ne!(a, b);
        assert!(list_documents(&app, None).unwrap().is_empty());
        assert!(save_document(&app, input(&doc, "late")).is_err());
        assert!(apply_remote_documents(&app, &a, vec![remote(&doc, 1, "wrong account")]).is_err());
        assert!(finalize_sync_jobs(&app, &a, &[], &[], true, None, None).is_err());
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        assert!(get_document(&app, &doc.id).unwrap().is_some());
        save_supabase_config(
            &app,
            SupabaseConfig {
                url: Some("https://other.supabase.co".into()),
                anon_key: Some("test".into()),
            },
        )
        .unwrap();
        assert!(get_supabase_session(&app).unwrap().is_none());
        assert!(get_document(&app, &guest.id).unwrap().is_some());
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        assert_ne!(a, get_app_state(&app).unwrap().account_scope);
        assert!(list_documents(&app, None).unwrap().is_empty());
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn failed_move_rolls_back_entire_subtree_and_status_queues_every_node() {
        let app = app();
        let root = create(&app, "guest", "folder", None);
        let child = create(&app, "guest", "folder", Some(&root.id));
        let leaf = create(&app, "guest", "document", Some(&child.id));
        let mut target = create(&app, "guest", "folder", None);
        for _ in 0..6 {
            target = create(&app, "guest", "folder", Some(&target.id));
        }
        let before = export_sync_documents(&app, "guest").unwrap();
        assert!(move_document(&app, "guest", &root.id, Some(&target.id)).is_err());
        assert_eq!(
            get_document(&app, &root.id).unwrap().unwrap().parent_id,
            None
        );
        assert_eq!(get_document(&app, &leaf.id).unwrap().unwrap().depth, 2);
        assert_eq!(
            export_sync_documents(&app, "guest")
                .unwrap()
                .pending_job_ids,
            before.pending_job_ids
        );
        set_document_status(&app, "guest", &root.id, "trashed").unwrap();
        let exported = export_sync_documents(&app, "guest").unwrap();
        for id in [&root.id, &child.id, &leaf.id] {
            assert_eq!(
                exported
                    .documents
                    .iter()
                    .find(|d| &d.id == id)
                    .unwrap()
                    .status,
                "trashed"
            );
        }
        set_document_status(&app, "guest", &root.id, "active").unwrap();
        move_document(&app, "guest", &child.id, None).unwrap();
        assert_eq!(get_document(&app, &leaf.id).unwrap().unwrap().depth, 1);
        assert!(move_document(&app, "guest", &child.id, Some(&leaf.id)).is_err());
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn storage_failure_cannot_partly_save_content_tags_or_outbox() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let conn = open_db(&app).unwrap();
        conn.execute_batch("CREATE TRIGGER fail_queue BEFORE INSERT ON sync_queue BEGIN SELECT RAISE(ABORT,'injected disk failure'); END;").unwrap();
        assert!(save_document(&app, input(&d, "new content")).is_err());
        let after = get_document(&app, &d.id).unwrap().unwrap();
        assert_eq!(after.content_json, d.content_json);
        assert_eq!(after.tags, d.tags);
        assert_eq!(
            export_sync_documents(&app, "guest")
                .unwrap()
                .documents
                .len(),
            1
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn outbox_compacts_history_is_bounded_and_old_ack_keeps_new_edit() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        for n in 0..50 {
            save_document(&app, input(&d, &format!("edit {n}"))).unwrap();
        }
        let first = export_sync_documents(&app, "guest").unwrap();
        assert_eq!(first.pending_job_ids.len(), 1);
        let conn = open_db(&app).unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM document_history WHERE document_id=?1",
                [&d.id],
                |r| r.get(0),
            )
            .unwrap();
        assert!(count <= 20);
        assert!(
            get_app_state(&app)
                .unwrap()
                .limits
                .current_total_storage_bytes
                > d.content_json.len()
        );
        save_document(&app, input(&d, "concurrent")).unwrap();
        finalize_sync_jobs(
            &app,
            "guest",
            &first.pending_job_ids,
            &[remote(&d, 10, "edit 49")],
            true,
            None,
            None,
        )
        .unwrap();
        let remaining = export_sync_documents(&app, "guest").unwrap();
        assert_eq!(remaining.documents[0].plain_text, "concurrent");
        assert_eq!(remaining.documents[0].revision, 10);
        assert_eq!(remaining.pending_job_ids.len(), 1);
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn remote_conflict_preserves_content_and_entire_local_tree_as_copy() {
        let app = app();
        let root = create(&app, "guest", "folder", None);
        let leaf = create(&app, "guest", "document", Some(&root.id));
        let first = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(
            &app,
            "guest",
            &first.pending_job_ids,
            &[remote(&root, 1, "folder"), remote(&leaf, 2, "base")],
            true,
            None,
            None,
        )
        .unwrap();
        save_document(&app, input(&leaf, "unsynced local")).unwrap();
        let result = apply_remote_documents(
            &app,
            "guest",
            vec![remote(&root, 1, "folder"), remote(&leaf, 3, "remote newer")],
        )
        .unwrap();
        assert_eq!(result.conflict_copies, 1);
        let original = get_document(&app, &leaf.id).unwrap().unwrap();
        assert_eq!(original.plain_text, "remote newer");
        let exported = export_sync_documents(&app, "guest").unwrap();
        assert_eq!(exported.documents.len(), 2);
        let copy = exported
            .documents
            .iter()
            .find(|d| d.node_kind == "document")
            .unwrap();
        assert_eq!(copy.plain_text, "unsynced local");
        assert_ne!(copy.parent_id.as_ref().unwrap(), &root.id);
        assert!(exported
            .documents
            .iter()
            .any(|d| Some(&d.id) == copy.parent_id.as_ref()));
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn malformed_remote_tree_rolls_back_and_permanent_delete_retains_only_tombstones() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let mut invalid = remote(&d, 5, "bad");
        invalid.parent_id = Some(uuid::Uuid::new_v4().to_string());
        invalid.depth = 1;
        assert!(apply_remote_documents(&app, "guest", vec![invalid]).is_err());
        assert_eq!(get_document(&app, &d.id).unwrap().unwrap().title, d.title);
        assert!(permanently_delete_document(&app, "guest", &d.id).is_err());
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        permanently_delete_document(&app, "guest", &d.id).unwrap();
        assert!(get_document(&app, &d.id).unwrap().is_none());
        let tombstone = export_sync_documents(&app, "guest").unwrap();
        assert!(tombstone.documents[0].is_purged);
        let conn = open_db(&app).unwrap();
        assert_eq!(
            conn.query_row("SELECT count(*) FROM document_history", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn legacy_unknown_owner_is_quarantined_until_explicit_recovery_and_guest_copy_is_explicit() {
        let app = app();
        let dir = local_data_dir(&app).unwrap();
        let original = create(&app, "guest", "folder", None);
        let child = create(&app, "guest", "document", Some(&original.id));
        save_document(&app, input(&child, "legacy body")).unwrap();
        std::fs::copy(dir.join("space-guest.db"), dir.join("vana.db")).unwrap();
        let baseline = std::fs::read(dir.join("vana.db")).unwrap();
        std::fs::remove_file(dir.join("control.db")).unwrap();
        std::fs::remove_file(dir.join("space-guest.db")).unwrap();
        let state = get_app_state(&app).unwrap();
        assert!(state.recovery_available);
        assert!(get_document(&app, &original.id).unwrap().is_none());
        let imported = recover_local_documents(&app, "guest", "legacy").unwrap();
        assert_eq!(imported, 3);
        assert!(recover_local_documents(&app, "guest", "legacy").is_err());
        assert_eq!(std::fs::read(dir.join("vana.db")).unwrap(), baseline);
        let recovered = list_documents(&app, None).unwrap();
        assert!(recovered.iter().any(|d| d.title == "legacy body"));
        configure(&app);
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        let scope = get_app_state(&app).unwrap().account_scope;
        assert!(list_documents(&app, None).unwrap().is_empty());
        assert_eq!(
            recover_local_documents(&app, &scope, "guest").unwrap(),
            recovered.len()
        );
        assert!(export_sync_documents(&app, &scope)
            .unwrap()
            .documents
            .iter()
            .any(|d| d.plain_text == "legacy body"));
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn restoring_a_child_detaches_it_from_a_trashed_parent_without_invalid_hierarchy() {
        let app = app();
        let root = create(&app, "guest", "folder", None);
        let child = create(&app, "guest", "folder", Some(&root.id));
        let leaf = create(&app, "guest", "document", Some(&child.id));
        set_document_status(&app, "guest", &root.id, "trashed").unwrap();
        set_document_status(&app, "guest", &child.id, "active").unwrap();
        assert_eq!(
            get_document(&app, &child.id).unwrap().unwrap().parent_id,
            None
        );
        assert_eq!(get_document(&app, &leaf.id).unwrap().unwrap().depth, 1);
        assert_eq!(
            get_document(&app, &root.id).unwrap().unwrap().status,
            "trashed"
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn deletion_racing_cloud_edit_preserves_cloud_content_and_keeps_delete_intent() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let first = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(
            &app,
            "guest",
            &first.pending_job_ids,
            &[remote(&d, 1, "base")],
            true,
            None,
            None,
        )
        .unwrap();
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        permanently_delete_document(&app, "guest", &d.id).unwrap();
        let result = apply_remote_documents(
            &app,
            "guest",
            vec![remote(&d, 2, "cloud edit while deleting")],
        )
        .unwrap();
        assert_eq!(result.conflict_copies, 1);
        let pending = export_sync_documents(&app, "guest").unwrap();
        assert!(pending
            .documents
            .iter()
            .any(|doc| doc.is_purged && doc.revision == 2 && doc.id == d.id));
        assert!(pending
            .documents
            .iter()
            .any(|doc| !doc.is_purged && doc.plain_text == "cloud edit while deleting"));
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn search_returns_literal_hits_with_document_ids_and_real_context() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        save_document(&app, input(&d, "special [ ( .* % _ 中文")).unwrap();
        for query in ["[", "(", ".*", "%", "_", "中文"] {
            let hits = simple_search(&app, query).unwrap();
            assert_eq!(hits.len(), 1);
            assert_eq!(hits[0].document_id, d.id);
            assert!(hits[0].matches[0].context.contains(query));
        }
        assert!(simple_search(&app, "does not occur").unwrap().is_empty());
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        assert!(simple_search(&app, "[").unwrap().is_empty());
        std::fs::remove_dir_all(app.0).unwrap();
    }

    #[test]
    fn pull_recognizes_a_successful_mutation_after_lost_network_ack_without_duplicate_copy() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        save_document(&app, input(&d, "sent")).unwrap();
        let exported = export_sync_documents(&app, "guest").unwrap();
        let mut accepted = remote(&d, 10, "sent");
        accepted.mutation_id = exported.documents[0].mutation_id.clone();
        let result = apply_remote_documents(&app, "guest", vec![accepted]).unwrap();
        assert_eq!(result.conflict_copies, 0);
        assert!(export_sync_documents(&app, "guest")
            .unwrap()
            .pending_job_ids
            .is_empty());
        assert_eq!(
            get_document(&app, &d.id).unwrap().unwrap().plain_text,
            "sent"
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn in_memory_edits_created_before_a_pull_cannot_overwrite_applied_remote_content() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let first = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(
            &app,
            "guest",
            &first.pending_job_ids,
            &[remote(&d, 1, "base")],
            true,
            None,
            None,
        )
        .unwrap();
        let queued = input(&d, "in-memory late edit");
        apply_remote_documents(&app, "guest", vec![remote(&d, 2, "must preserve cloud")]).unwrap();
        let saved = save_document(&app, queued).unwrap();
        assert_ne!(saved.id, d.id);
        assert_eq!(saved.plain_text, "in-memory late edit");
        assert_eq!(
            get_document(&app, &d.id).unwrap().unwrap().plain_text,
            "must preserve cloud"
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn late_token_refresh_logout_or_login_cannot_switch_a_new_account_or_project() {
        let app = app();
        configure(&app);
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000001")).unwrap();
        let scope_a = get_app_state(&app).unwrap().account_scope;
        save_supabase_session(&app, session("00000000-0000-0000-0000-000000000002")).unwrap();
        assert!(db::clear_supabase_session(&app, &scope_a).is_err());
        assert!(db::save_supabase_session(
            &app,
            session("00000000-0000-0000-0000-000000000001"),
            "https://example.supabase.co",
            Some(&scope_a)
        )
        .is_err());
        assert!(db::save_supabase_session(
            &app,
            session("00000000-0000-0000-0000-000000000001"),
            "https://wrong.supabase.co",
            None
        )
        .is_err());
        assert_eq!(
            get_supabase_session(&app)
                .unwrap()
                .unwrap()
                .user_id
                .as_deref(),
            Some("00000000-0000-0000-0000-000000000002")
        );
        std::fs::remove_dir_all(app.0).unwrap();
    }
    #[test]
    fn another_device_already_purging_the_same_document_clears_the_pending_delete() {
        let app = app();
        let d = create(&app, "guest", "document", None);
        let first = export_sync_documents(&app, "guest").unwrap();
        finalize_sync_jobs(
            &app,
            "guest",
            &first.pending_job_ids,
            &[remote(&d, 1, "base")],
            true,
            None,
            None,
        )
        .unwrap();
        set_document_status(&app, "guest", &d.id, "trashed").unwrap();
        permanently_delete_document(&app, "guest", &d.id).unwrap();
        let mut cloud = remote(&d, 2, "");
        cloud.is_purged = true;
        cloud.status = "trashed".into();
        cloud.content_json = "{\"type\":\"doc\",\"content\":[]}".into();
        let result = apply_remote_documents(&app, "guest", vec![cloud]).unwrap();
        assert_eq!(result.conflict_copies, 0);
        assert!(export_sync_documents(&app, "guest")
            .unwrap()
            .pending_job_ids
            .is_empty());
        assert!(get_document(&app, &d.id).unwrap().is_none());
        std::fs::remove_dir_all(app.0).unwrap();
    }
}
