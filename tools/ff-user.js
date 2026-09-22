// Preferences for the scratch Firefox profile used by tools/browser-check.sh.
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("webgl.force-enabled", true);
// Tests must never be audible.
user_pref("media.volume_scale", "0.0");
// The live check posts its report from the public site to a 127.0.0.1 collector.
user_pref("network.lna.enabled", false);
user_pref("network.lna.blocking", false);
// Page console output and script errors go to Firefox's stdout, which the check captures.
user_pref("devtools.console.stdout.content", true);
