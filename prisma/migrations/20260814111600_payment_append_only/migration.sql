-- 收款是经营事实，只允许通过后续反向记录纠正，禁止原地修改或删除。
CREATE FUNCTION reject_payment_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'payment is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_append_only
BEFORE UPDATE OR DELETE ON "payment"
FOR EACH ROW EXECUTE FUNCTION reject_payment_mutation();
