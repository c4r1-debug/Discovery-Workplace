# Security and repository checks

Discovery is a local application. Keep its dashboard bound to loopback. Publishing
its source does not make the SQLite database or Windows worker ready for hosting.

Before uploading, inspect the exact files being committed. Never include live
databases, exported prospects, account hashes, recovery codes, API credentials,
encryption keys, backups, or screenshots showing private records. These belong
outside Git; `.gitignore` covers the current local data and output directories.
Tests use temporary storage and synthetic contact fixtures. Example passwords in
tests are test inputs, never configured application credentials.

The Repository checks workflow runs Gitleaks, a dependency vulnerability audit,
the automated tests, and a production build on pushes and pull requests. It uses
read-only repository permissions and pins third-party actions to commit SHAs.
CI runs after upload: it cannot retract a secret already published. Review locally
before the first push, and rotate any real credential that reaches Git history.

Manually review authentication, SQL parameters, rendered HTML, subprocess arguments,
network restrictions, configuration paths, and third-party attribution when changing
those areas. Automated checks do not prove the absence of vulnerabilities, copied
proprietary material, or personal data. Operational console messages and loopback
URLs are intentional in this local edition.

Report suspected vulnerabilities privately to the repository owner. Do not post
working credentials or prospect records in public issues.
