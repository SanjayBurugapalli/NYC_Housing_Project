You are implementing a deterministic natural language search parser for a web app that queries NYC 311-based health data.

The goal is to convert a free-form user query into a structured query object that can be translated into SQL.

This system MUST NOT rely on AI/LLM APIs. It should be fully rule-based, fast, and deterministic.

---

## 🧠 High-Level Requirements

Build a parsing pipeline:

User Query (string)
→ Normalize + Tokenize
→ Extract Entities (borough, neighborhoods)
→ Match Concepts (noise, cleanliness, rodents, etc.)
→ Infer Intent (low/high, best/worst)
→ Output Structured Query Object

---

## 📦 Expected Output Format

Return a JSON object like:

{
"borough": "Brooklyn",
"filters": [],
"sort": [
{ "column": "noise_complaints", "order": "ASC" },
{ "column": "cleanliness_score", "order": "DESC" }
],
"limit": 10,
"confidence": 0.85
}

---

## 🧱 Implementation Details

### 1. Normalization

* lowercase input
* remove punctuation
* remove filler words (e.g. "areas", "places", "with", "in", "near")

---

### 2. Entity Extraction

Support:

* boroughs: Manhattan, Brooklyn, Queens, Bronx, Staten Island
* optional: neighborhoods (if present in dataset)

Example:
"quiet areas in brooklyn" → borough = "Brooklyn"

---

### 3. Concept Dictionary

Define a structured mapping:

const CONCEPTS = {
noise: {
column: "noise_complaints",
synonyms: ["noise", "noisy", "quiet", "loud"],
intentMap: {
quiet: "ASC",
noisy: "DESC",
loud: "DESC"
}
},
cleanliness: {
column: "cleanliness_score",
synonyms: ["clean", "dirty", "sanitary"],
intentMap: {
clean: "DESC",
dirty: "ASC"
}
},
rodents: {
column: "rodent_complaints",
synonyms: ["rats", "rodents", "mice"],
intentMap: {
low: "ASC",
high: "DESC"
}
}
};

---

### 4. Phrase-Level Matching (IMPORTANT)

Support multi-word phrases:

* "low noise"
* "high noise"
* "low rodent complaints"
* "very clean"
* "not noisy"

Use simple n-gram matching or regex.

Phrase-level matches should override single-word matches.

---

### 5. Intent Extraction

Map modifiers to sort direction:

LOW / GOOD:

* low, quiet, clean, safe → ASC or DESC depending on metric

HIGH / BAD:

* high, loud, dirty → reverse

Also support:

* "best" → use composite_score DESC
* "worst" → use composite_score ASC

---

### 6. Sorting Logic

If multiple concepts detected:

* combine into ordered sort list

Example:
"quiet and clean"
→ ORDER BY noise ASC, cleanliness DESC

---

### 7. Composite Score (assume exists in DB)

Column: composite_score

Used for:

* "best areas"
* "worst areas"

---

### 8. Confidence Scoring

Compute a confidence score (0–1):

+0.4 if borough detected
+0.3 if ≥1 concept matched
+0.2 if intent (low/high/best/etc.) detected
+0.1 if multiple concepts matched

If confidence < 0.5 → mark as low confidence

---

### 9. Fallback Flag

Include:
"needsFallback": true/false

Set to true if:

* no concepts matched
* confidence < 0.5

---

### 10. Code Structure

Implement as a reusable module:

parseQuery(query: string): ParsedQuery

Break into functions:

* normalize(query)
* extractEntities(tokens)
* matchConcepts(tokens)
* extractIntent(tokens)
* buildSort(concepts, intent)
* computeConfidence(...)

---

### 11. Edge Cases

Handle:

* empty or vague queries ("best places")
* conflicting intents ("quiet but loud" → pick strongest or first)
* duplicate concepts

---

### 12. Example Inputs / Outputs

Input:
"quiet clean neighborhoods in queens"

Output:
{
"borough": "Queens",
"sort": [
{ "column": "noise_complaints", "order": "ASC" },
{ "column": "cleanliness_score", "order": "DESC" }
],
"confidence": 0.9,
"needsFallback": false
}

---

Input:
"places to live"

Output:
{
"sort": [{ "column": "composite_score", "order": "DESC" }],
"confidence": 0.3,
"needsFallback": true
}

---

## 🚀 Deliverables

* Clean, modular, readable code
* No external NLP/AI libraries
* Include inline comments explaining logic
* Include a few unit-test-style examples

---

Focus on writing clean, extensible logic—not hardcoded if/else chains.
