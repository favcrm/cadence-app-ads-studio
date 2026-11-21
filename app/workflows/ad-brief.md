---
title: "Ad brief: {{offer}}"
goal: "One rubric-checked plain-text ad copy brief for Meta or Google Search from pasted offer facts"
label: New ad copy brief
inputs:
  offer: { ask: "Offer and price, one line", example: "Single Origin Beans 250g from HK$148" }
  channel: { ask: "Channel and constraints", example: "Google Search RSA (30/90 chars) and Meta Feed" }
  writer: { ask: "Registered writer in the owner PM group" }
---

One text-only ad copy brief for a person to review. No step reads or
changes an ad account, creates a live campaign, or commits external ad spend.

## Draft ad copy brief: {{offer}}
agent: {{writer}}
size: S
action: local.text.produce

Draft one plain-text ad copy brief using only the quoted offer facts and channel rules:
OFFER: {{offer}}
CHANNEL: {{channel}}

Follow `rubrics/ad-policy.md`: preserve exact currency and prices (`HK$`),
avoid unverified superlatives ("best", "#1", "guaranteed"), and label
character counts for Google RSA headlines (`<= 30`) and descriptions
(`<= 90`). Do not claim any ad or image was uploaded or published.

Return only the brief as one text/plain artifact through the authenticated
local run result envelope in the kickoff. At most 1,500 Unicode characters.
No fetching URLs, files or records, and no platform calls.

### Acceptance
- [ ] one bounded plain-text ad copy brief
- [ ] exact offer facts and prices preserved
- [ ] no unverified superlatives and no external campaign claim
