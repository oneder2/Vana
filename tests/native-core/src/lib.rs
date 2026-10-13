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
