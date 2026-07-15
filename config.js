/**
 * TuneCamp community website configuration.
 *
 * The community pages (community.html, player.html) have no backend of their
 * own. They discover the network by querying the public `/api/community/sites`
 * endpoint of one or more live TuneCamp "directory" instances. Each instance
 * already aggregates the whole network it knows about (local + federated +
 * ActivityPub), so a single reachable instance is enough — listing several
 * adds resilience if one is offline.
 *
 * Add one or more TuneCamp instance origins below (https://host, NO trailing
 * slash). Results from all of them are merged and de-duplicated by URL.
 */
window.TUNECAMP_DIRECTORY = [
    "https://sudorecords.scobrudot.dev",
    "https://tunecamp.subterralabel.com",
    "https://tunecamp.fdalabs.net"
];

/**
 * Base URL of the tunecamp-sso service (see the `tunecamp-sso` repo) used by
 * signin.html for the "Sign in with your instance" flow.
 */
window.TUNECAMP_SSO_URL = "https://sso.tunecamp.org";
