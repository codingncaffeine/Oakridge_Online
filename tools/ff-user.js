// Preferences for the scratch Firefox profile used by tools/browser-check.sh.
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionEnabled", false);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("webgl.force-enabled", true);
// Tests must never be audible: the volume is nil here, and the page mutes its own sound in self-test mode.
user_pref("media.volume_scale", "0.0");
// The audio clock has to run without a real click, or sounds never finish and the check sees them pile up.
user_pref("media.autoplay.default", 0);
user_pref("media.autoplay.blocking_policy", 0);
// The live check posts its report from the public site to a 127.0.0.1 collector.
user_pref("network.lna.enabled", false);
user_pref("network.lna.blocking", false);
// Page console output and script errors go to Firefox's stdout, which the check captures.
user_pref("devtools.console.stdout.content", true);
