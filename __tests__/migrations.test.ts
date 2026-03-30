import { up as usersUp, down as usersDown } from "../src/db/migrations/20260329000001_create_users";
import { up as leasesUp, down as leasesDown } from "../src/db/migrations/20260329000002_create_leases";
import { up as readingsUp, down as readingsDown } from "../src/db/migrations/20260329000003_create_odometer_readings";
import { up as tripsUp, down as tripsDown } from "../src/db/migrations/20260329000004_create_saved_trips";
import { up as alertsUp, down as alertsDown } from "../src/db/migrations/20260329000005_create_alert_configs";
import { up as subsUp, down as subsDown } from "../src/db/migrations/20260329000006_create_subscriptions";
import { up as membersUp, down as membersDown } from "../src/db/migrations/20260329000007_create_lease_members";
import { up as triggersUp, down as triggersDown } from "../src/db/migrations/20260329000008_add_updated_at_triggers";
import { up as origTxnUp, down as origTxnDown } from "../src/db/migrations/20260330000009_add_original_transaction_id_to_subscriptions";
import { seed as devSeed } from "../src/db/seeds/20260329000001_dev_seed";

describe("migration exports", () => {
  it("users migration exports up and down functions", () => {
    expect(typeof usersUp).toBe("function");
    expect(typeof usersDown).toBe("function");
  });

  it("leases migration exports up and down functions", () => {
    expect(typeof leasesUp).toBe("function");
    expect(typeof leasesDown).toBe("function");
  });

  it("odometer_readings migration exports up and down functions", () => {
    expect(typeof readingsUp).toBe("function");
    expect(typeof readingsDown).toBe("function");
  });

  it("saved_trips migration exports up and down functions", () => {
    expect(typeof tripsUp).toBe("function");
    expect(typeof tripsDown).toBe("function");
  });

  it("alert_configs migration exports up and down functions", () => {
    expect(typeof alertsUp).toBe("function");
    expect(typeof alertsDown).toBe("function");
  });

  it("subscriptions migration exports up and down functions", () => {
    expect(typeof subsUp).toBe("function");
    expect(typeof subsDown).toBe("function");
  });

  it("lease_members migration exports up and down functions", () => {
    expect(typeof membersUp).toBe("function");
    expect(typeof membersDown).toBe("function");
  });

  it("updated_at triggers migration exports up and down functions", () => {
    expect(typeof triggersUp).toBe("function");
    expect(typeof triggersDown).toBe("function");
  });

  it("add_original_transaction_id migration exports up and down functions", () => {
    expect(typeof origTxnUp).toBe("function");
    expect(typeof origTxnDown).toBe("function");
  });
});

describe("seed exports", () => {
  it("dev seed exports a seed function", () => {
    expect(typeof devSeed).toBe("function");
  });
});
