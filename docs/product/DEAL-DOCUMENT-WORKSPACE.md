# Deal document workspace

The deal cockpit now restores the source LOS document workspace's core visible hierarchy: derived requirement rows, lifecycle status, associated immutable file versions, size and upload facts, scan disposition, legal-hold indicators, and a governed download action for verified-clean content.

The workspace does not fabricate completeness. Empty requirements remain visibly incomplete, missing files are explicit, quarantined or rejected versions cannot be downloaded, and the installed download route remains unavailable while its server gate is off. Request, receive, review, return, waive, and upload actions are shown as pending rather than wired to ungoverned writes.

This is a read-and-download surface, not document lifecycle completion. The next document phases must add governed upload and requirement-transition commands, browser verification, cross-tenant denial evidence, reload behavior, and production commissioning evidence.
