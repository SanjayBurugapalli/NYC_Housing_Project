"""Owner / managing-agent name normalization for landlord grouping.

PLUTO owner names and HPD managing-agent names are noisy: the same landlord
appears as "ABC REALTY LLC", "ABC REALTY, L.L.C.", and "ABC REALTY CORP".
Normalizing away legal-entity suffixes and punctuation lets us group those
into a single portfolio (Tier 1 matching).

The Python `normalize_entity_name` and the SQL expression from
`normalized_entity_sql` MUST stay in sync — they encode the same rules so
that unit tests on the Python side describe the grouping the DB performs.
"""

import re

# Legal-entity suffixes and generic real-estate noise words removed before
# grouping. Conservative on purpose — aggressive stripping over-merges
# distinct owners (the documented Tier 1 trade-off).
ENTITY_STOPWORDS: list[str] = [
    "LLC", "LLP", "LP", "INC", "INCORPORATED", "CORP", "CORPORATION",
    "CO", "COMPANY", "COMPANIES", "LTD", "REALTY", "REALTIES",
    "ASSOC", "ASSOCIATE", "ASSOCIATES", "ASSOCIATION",
    "MGMT", "MANAGEMENT", "HOLDING", "HOLDINGS",
    "PROPERTY", "PROPERTIES", "HDFC", "GROUP", "PARTNERS", "PARTNERSHIP",
    "ENTERPRISE", "ENTERPRISES", "DEVELOPMENT", "OWNER", "OWNERS",
]

_STOPWORD_SET = set(ENTITY_STOPWORDS)
_NON_ALNUM = re.compile(r"[^A-Z0-9 ]")
_LEADING_THE = re.compile(r"^\s*THE\s+")


def normalize_entity_name(name: str | None) -> str | None:
    """Normalize an owner/agent name to a grouping key, or None if empty.

    Steps (mirrored in SQL by `normalized_entity_sql`):
      1. Uppercase, trim.
      2. Drop periods ("L.L.C." -> "LLC"), expand "&" to "AND".
      3. Replace remaining punctuation with spaces.
      4. Strip a leading "THE".
      5. Remove whole-word legal-entity stopwords.
      6. Collapse whitespace.
    """
    if not name:
        return None
    s = name.upper().strip()
    s = s.replace(".", "").replace("&", " AND ")
    s = _NON_ALNUM.sub(" ", s)
    s = _LEADING_THE.sub(" ", s)
    tokens = [t for t in s.split() if t not in _STOPWORD_SET]
    result = " ".join(tokens).strip()
    return result or None


def normalized_entity_sql(col: str) -> str:
    """Return a SQL expression normalizing `col` the same way as
    `normalize_entity_name`. Returns NULL when normalization yields an empty
    string (e.g. a name that was only stopwords like "MANAGEMENT LLC").

    `col` is a trusted, hard-coded column reference — never user input.
    """
    stop = "|".join(ENTITY_STOPWORDS)
    # Standard-conforming strings: backslashes in the regex literals below are
    # literal, which is what Postgres' regex engine expects (\m / \M = word edges).
    return rf"""
        NULLIF(
            TRIM(regexp_replace(
                regexp_replace(
                    regexp_replace(
                        regexp_replace(
                            ' ' || REPLACE(REPLACE(UPPER(TRIM({col})), '.', ''), '&', ' AND ') || ' ',
                            '[^A-Z0-9 ]', ' ', 'g'
                        ),
                        '^\s*THE\s+', ' '
                    ),
                    '\m({stop})\M', ' ', 'g'
                ),
                '\s+', ' ', 'g'
            )),
            ''
        )
    """
