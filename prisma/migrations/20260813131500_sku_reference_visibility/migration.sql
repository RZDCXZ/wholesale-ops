-- Report whether any current or future business table has a foreign-key row
-- that references the SKU. This keeps delete affordances aligned with the same
-- database relationships that ultimately enforce deletion safety.
CREATE FUNCTION sku_has_business_references(target_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    reference RECORD;
    referenced BOOLEAN;
BEGIN
    FOR reference IN
        SELECT
            constraint_record.conrelid::regclass AS relation_name,
            referencing_attribute.attname AS column_name
        FROM pg_constraint AS constraint_record
        JOIN pg_attribute AS referencing_attribute
          ON referencing_attribute.attrelid = constraint_record.conrelid
         AND referencing_attribute.attnum = constraint_record.conkey[1]
        WHERE constraint_record.contype = 'f'
          AND constraint_record.confrelid = 'public.sku'::regclass
          AND cardinality(constraint_record.conkey) = 1
          AND cardinality(constraint_record.confkey) = 1
    LOOP
        EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
            reference.relation_name,
            reference.column_name
        ) INTO referenced USING target_id;

        IF referenced THEN
            RETURN TRUE;
        END IF;
    END LOOP;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;
