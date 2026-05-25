"""Pull Multiple Dwelling Registration data to extract managing agent names.

Socrata endpoints:
  - tesw-yqqr  Multiple Dwelling Registrations (BBL constructed from boroid+block+lot)
  - feu5-w2e2  Registration Contacts (agents; join on registrationid)

Writes managing_agent to the buildings table keyed by BBL.
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

REGISTRATIONS_ENDPOINT = "tesw-yqqr"
CONTACTS_ENDPOINT = "feu5-w2e2"
BATCH_SIZE = 50000


def pull_registrations(limit: int | None = None) -> int:
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    # --- Step 1: pull registrations (construct BBL from boroid+block+lot) ---
    logger.info("Fetching registrations...")
    all_regs: list[dict] = []
    offset = 0
    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break
        results = client.get(
            REGISTRATIONS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="registrationid,boroid,block,lot,registrationenddate",
        )
        if not results:
            break
        all_regs.extend(results)
        offset += batch_limit
        if len(results) < batch_limit:
            break

    if not all_regs:
        logger.warning("No registrations returned.")
        return 0

    regs_df = pd.DataFrame(all_regs)

    # Construct 10-digit BBL
    regs_df["bbl"] = (
        regs_df["boroid"].astype(str).str.strip().str.zfill(1) +
        regs_df["block"].astype(str).str.strip().str.zfill(5) +
        regs_df["lot"].astype(str).str.strip().str.zfill(4)
    )
    regs_df = regs_df[regs_df["bbl"].str.match(r"^\d{10}$")]

    # Keep most recent registration per BBL
    regs_df["registrationid"] = regs_df["registrationid"].astype(str)
    regs_df = regs_df.sort_values("registrationenddate", ascending=False).drop_duplicates("bbl")

    reg_ids = set(regs_df["registrationid"].tolist())
    logger.info(f"Registrations loaded: {len(regs_df)}")

    # --- Step 2: pull agent contacts ---
    logger.info("Fetching agent contacts...")
    all_contacts: list[dict] = []
    offset = 0
    while True:
        batch_limit = min(BATCH_SIZE, limit - offset) if limit else BATCH_SIZE
        if limit and offset >= limit:
            break
        results = client.get(
            CONTACTS_ENDPOINT,
            limit=batch_limit,
            offset=offset,
            select="registrationid,type,corporationname",
            where="type='Agent'",
        )
        if not results:
            break
        all_contacts.extend(results)
        offset += batch_limit
        if len(results) < batch_limit:
            break

    if not all_contacts:
        logger.warning("No agent contacts returned.")
        return 0

    contacts_df = pd.DataFrame(all_contacts)
    contacts_df["registrationid"] = contacts_df["registrationid"].astype(str)
    contacts_df = contacts_df[contacts_df["registrationid"].isin(reg_ids)]

    contacts_df["agent"] = contacts_df["corporationname"].astype(str).str.strip().replace("nan", None)
    contacts_df = contacts_df[contacts_df["agent"].notna() & (contacts_df["agent"] != "")].drop_duplicates("registrationid")

    # --- Step 3: join and update buildings ---
    merged = regs_df.merge(contacts_df[["registrationid", "agent"]], on="registrationid", how="inner")
    merged = merged[merged["bbl"].notna() & merged["agent"].notna()]
    logger.info(f"Updating managing_agent for {len(merged)} buildings")

    records = [{"bbl": row["bbl"], "managing_agent": row["agent"]} for _, row in merged.iterrows()]
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE buildings SET managing_agent = :managing_agent WHERE bbl = :bbl"),
            records,
        )

    logger.info("Registration pull complete.")
    return len(records)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Pull MDR registration / agent data")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    pull_registrations(limit=args.limit)
