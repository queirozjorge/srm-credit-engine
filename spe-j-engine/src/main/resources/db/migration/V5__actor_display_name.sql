ALTER TABLE audit_event
    ADD COLUMN actor_display_name VARCHAR(150),
    ADD CONSTRAINT audit_event_actor_display_name_nonblank
        CHECK (actor_display_name IS NULL OR btrim(actor_display_name) <> '');
