# Security Policy

## Scope

This repository contains the Splendor Private CRM application and its server-side business logic. Security reports involving authentication, authorization, Firestore access, payment flows, customer data, fleet data, document access, webhook verification, or deployment configuration are in scope.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a suspected security vulnerability.

Report it privately to the project owner at **ceo@splendorcar.ae** with:

- A concise description of the issue and its impact.
- The affected route, file, or component.
- Reproduction steps or a proof of concept, if available.
- The affected commit, branch, or deployment URL.
- Any relevant logs or screenshots that do not expose customer secrets.

If the report involves an exposed credential, include only the credential type and location. Do not send the secret itself in an issue, email subject, or public channel.

## Response process

1. The report is triaged privately.
2. Reproduction and severity are assessed.
3. A fix is developed on a protected non-production branch.
4. CI, security tests, and deployment validation must pass before production release.
5. The production branch is updated only through the protected pull-request gate.

## Supported production branch

`main` is the protected production branch. Direct force-pushes and deletion are prohibited by repository rules.
