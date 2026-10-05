const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

// Lets MainActivity shrink into a picture-in-picture window. Bhaktara uses it
// only to keep a "turn on the switch" guide visible over Android's
// "Modify system settings" screen (ringtone permission, for elderly users).
// The activity already handles screen-size config changes, so PiP does not
// restart it.
module.exports = function withPictureInPicture(config) {
  return withAndroidManifest(config, (mod) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      mod.modResults,
    );
    activity.$["android:supportsPictureInPicture"] = "true";
    return mod;
  });
};
// Note: leave `supportsPictureInPicture` unset in the expo-video plugin
// options; `false` there deletes this attribute. Status videos still never
// enter picture-in-picture (VideoView does not opt in).
