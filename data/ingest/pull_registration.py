"""Pull Multiple Dwelling Registration data to extract managing agent names.

Socrata endpoints:
  - tesw-yqqr  Multiple Dwelling Registrations (one row per building registration)
  - feu5-w2e2  Registration Contacts (agents, officers; join on registrationid)

Writes managing_agent to the buildings table keyed by BBL.
"""

import logging

import pandas as pd
from sqlalchemy import text

from base import get_socrata_client, get_db_engine, clean_row_for_sql

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

REGISTRATIONS_ENDPOINT = "tesw-yqqr"
CONTACTS_ENDPOINT = "feu5-w2e2"
BATCH_SIZE = 50000


def pull_registrations(limit: int | None = None) -> int:
    """Pull active registrations + agent contacts, update buildings.managing_agent."""
    client = get_socrata_client()
    client.timeout = 300
    engine = get_db_engine()

    # --- Step 1: pull active registrations (BBL → registrationid) ---
    logger.info("Fetching active registrations...")
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
            select="registrationid,bbl,lifecyclestage",
            where="lifecyclestage='Active'",
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
    regs_df["bbl"] = (
        pd.to_numeric(regs_df["bbl"], errors="coerce")
        .fillna(0)
        .astype(int)
        .astype(str)
        .str.zfill(10)
        .replace("0000000000", None)
    )
    regs_df = regs_df[regs_df["bbl"].notna()].drop_duplicates("bbl")
    reg_ids = set(regs_df["registrationid"].astype(str).tolist())
    logger.info(f"Active registrations: {len(regs_df)}")

    # --- Step 2: pull agent contacts ---
    logger.info("Fetching registration contacts (type=Agent)...")
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
            select="registrationid,type,firstname,lastname,corporationname",
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

    # Build agent display name: corp name if present, else first + last
    def agent_name(row):
        corp = str(row.get("corporationname", "") or "").strip()
        if corp:
            return corp
        first = str(row.get("firstname", "") or "").strip()
        last = str(row.get("lastname", "") or "").strip()
        full = f"{first} {last}".strip()
        return full if full else None

    contacts_df["agent"] = contacts_df.apply(agent_name, axis=1)
    contacts_df = contacts_df[contacts_df["agent"].notna()].drop_duplicates("registrationid")

    # --- Step 3: join and update buildings ---
    merged = regs_df.merge(contacts_df[["registrationid", "agent"]], on="registrationid", how="inner")
    merged = merged[merged["bbl"].notna() & merged["agent"].notna()]
    logger.info(f"Updating managing_agent for {len(merged)} buildings")

    records = [{"bbl": row["bbl"], "managing_agent": row["agent"]} for _, row in merged.iterrows()]
    with engine.begin() as conn:
        conn.execute(
            text("""
                UPDATE buildings
                SET managing_agent = :managing_agent
                WHERE bbl = :bbl
            """),
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
