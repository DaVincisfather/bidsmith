-- M4 Session 3 follow-up: file_url is being phased out in favour of
-- file_path (added in 013). The radar analyze flow has no real URL —
-- it stored synthetic strings like 'ted://notice/<id>'. New uploads
-- write file_path and leave file_url NULL. Make the column optional.

ALTER TABLE documents ALTER COLUMN file_url DROP NOT NULL;
