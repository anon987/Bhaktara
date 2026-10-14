package com.bhaktara.media

import android.Manifest
import android.annotation.TargetApi
import android.app.Activity
import android.app.AppOpsManager
import android.app.PictureInPictureParams
import android.app.WallpaperManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Process
import android.provider.BaseColumns
import android.provider.MediaStore
import android.provider.Settings
import android.util.Rational
import androidx.core.content.FileProvider
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.coroutines.resume
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

// Saved media lands in a "Bhaktara" folder inside the standard public directory for its kind.
private const val ALBUM = "Bhaktara"
private val SAFE_FILE_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
private val SAFE_PACKAGE_NAME = Regex("^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z][A-Za-z0-9_]*)+$")
// Declared in this module's AndroidManifest.xml; serves only the cache share folder.
private const val FILE_PROVIDER_SUFFIX = ".BhaktaraMediaFileProvider"

// Error codes are part of the JS contract (modules/bhaktara-media/index.ts).
internal class StoragePermissionDeniedException :
  CodedException("ERR_PERMISSION_DENIED", "Storage permission was denied", null)

internal class WriteSettingsDeniedException :
  CodedException("ERR_WRITE_SETTINGS_DENIED", "Modify system settings is not allowed for this app", null)

internal class WallpaperUnsupportedException(message: String) :
  CodedException("ERR_UNSUPPORTED", message, null)

internal class InvalidArgumentException(message: String) :
  CodedException("ERR_INVALID_ARGUMENT", message, null)

internal class MediaWriteException(message: String, cause: Throwable? = null) :
  CodedException("ERR_MEDIA_WRITE", message, cause)

private enum class MediaKind(val directory: String) {
  IMAGE(Environment.DIRECTORY_PICTURES),
  VIDEO(Environment.DIRECTORY_MOVIES),
  AUDIO(Environment.DIRECTORY_RINGTONES);

  @TargetApi(Build.VERSION_CODES.Q)
  fun collection(): Uri = when (this) {
    IMAGE -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    VIDEO -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    AUDIO -> MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
  }

  fun legacyCollection(): Uri = when (this) {
    IMAGE -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
    VIDEO -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
    AUDIO -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
  }

  companion object {
    fun from(value: String) = when (value) {
      "image" -> IMAGE
      "video" -> VIDEO
      "audio" -> AUDIO
      else -> throw InvalidArgumentException("Unknown media kind: $value")
    }
  }
}

/**
 * Save to the device library (MediaStore), set the wallpaper (WallpaperManager) and set the
 * ringtone (RingtoneManager) from a file the JS layer has already downloaded into the app cache.
 *
 * Android 10+ (API 29+) writes through MediaStore with no storage permission (scoped storage).
 * Android 7–9 (API 24–28) needs WRITE_EXTERNAL_STORAGE, which expo-file-system merges into the manifest
 * with maxSdkVersion; it is requested at runtime only on those versions.
 */
class BhaktaraMediaModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BhaktaraMedia")

    // Only packages declared under <queries> in this module's manifest are visible.
    Function("isAppInstalled") { packageName: String ->
      SAFE_PACKAGE_NAME.matches(packageName) && isInstalled(packageName)
    }

    // The OAuth web client (type 3) that the Google Services plugin copies from
    // google-services.json; Google sign-in needs it to return an ID token.
    Function("googleWebClientId") {
      val id = context.resources.getIdentifier("default_web_client_id", "string", context.packageName)
      if (id == 0) null else context.getString(id)
    }

    Function("canSetWallpaper") {
      val manager = WallpaperManager.getInstance(context)
      manager.isWallpaperSupported && manager.isSetWallpaperAllowed
    }

    Function("canWriteSettings") {
      Settings.System.canWrite(context)
    }

    // Opens the system "Modify system settings" screen for this app and resolves once the user
    // returns, with whether the permission is now granted.
    AsyncFunction("requestWriteSettingsAsync") Coroutine { ->
      if (Settings.System.canWrite(context)) {
        true
      } else {
        askForPermission(Manifest.permission.WRITE_SETTINGS)
        Settings.System.canWrite(context)
      }
    }

    // Picture-in-picture is available: Android 8+, the device has the feature, and the user has
    // not switched it off for Bhaktara (Settings → Apps → Special access → Picture-in-picture).
    Function("canUsePictureInPicture") {
      canUsePictureInPicture(appContext.currentActivity)
    }

    // Guided permission flow for elderly users: shrinks Bhaktara into a small picture-in-picture
    // window that keeps showing "turn on the switch", then opens this app's "Modify system
    // settings" screen full screen beneath it. Resolves false (opening nothing) when
    // picture-in-picture is unavailable, so the caller can fall back to the plain flow.
    AsyncFunction("openWriteSettingsWithGuideAsync") {
      val activity = appContext.currentActivity
      if (activity == null || !canUsePictureInPicture(activity)) return@AsyncFunction false
      val entered = try {
        activity.enterPictureInPictureMode(
          PictureInPictureParams.Builder().setAspectRatio(Rational(3, 4)).build()
        )
      } catch (error: IllegalStateException) {
        false
      }
      if (!entered) return@AsyncFunction false
      activity.startActivity(
        Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
      true
    }.runOnQueue(Queues.MAIN)

    // Waits (natively: JS timers are paused while Bhaktara is in picture-in-picture) until
    // "Modify system settings" is turned on, then brings Bhaktara back to full screen so the user
    // does not have to find the way back. Resolves false if stopped or after 10 minutes.
    AsyncFunction("waitForWriteSettingsAsync") Coroutine { ->
      val granted = waitForWriteSettings()
      if (granted) returnToApp()
      granted
    }

    // Ends a pending waitForWriteSettingsAsync (the user came back on their own).
    Function("stopWaitingForWriteSettings") {
      settingsWatch?.complete(false)
      Unit
    }

    // Resolves with the content:// URI of the saved item.
    AsyncFunction("saveToLibraryAsync") Coroutine { fileUri: String, kind: String, displayName: String, mimeType: String, title: String ->
      saveToLibrary(cacheFile(fileUri), MediaKind.from(kind), displayName, mimeType, title).toString()
    }

    AsyncFunction("setWallpaperAsync") Coroutine { fileUri: String, target: String ->
      val which = when (target) {
        "home" -> WallpaperManager.FLAG_SYSTEM
        "lock" -> WallpaperManager.FLAG_LOCK
        "both" -> WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK
        else -> throw InvalidArgumentException("Unknown wallpaper target: $target")
      }
      val source = cacheFile(fileUri)
      withContext(Dispatchers.IO) {
        val manager = WallpaperManager.getInstance(context)
        if (!manager.isWallpaperSupported || !manager.isSetWallpaperAllowed) {
          throw WallpaperUnsupportedException("Setting the wallpaper is not allowed on this device")
        }
        try {
          source.inputStream().use { stream -> manager.setStream(stream, null, true, which) }
        } catch (error: Exception) {
          throw MediaWriteException("Could not set the wallpaper", error)
        }
      }
      true
    }

    // Saves the audio into Ringtones/Bhaktara, then makes it the default sound for the target.
    // Resolves with the content:// URI that was set.
    AsyncFunction("setRingtoneAsync") Coroutine { fileUri: String, target: String, displayName: String, mimeType: String, title: String ->
      val type = when (target) {
        "ringtone" -> RingtoneManager.TYPE_RINGTONE
        "notification" -> RingtoneManager.TYPE_NOTIFICATION
        "alarm" -> RingtoneManager.TYPE_ALARM
        else -> throw InvalidArgumentException("Unknown ringtone target: $target")
      }
      if (!Settings.System.canWrite(context)) {
        throw WriteSettingsDeniedException()
      }
      val uri = saveToLibrary(cacheFile(fileUri), MediaKind.AUDIO, displayName, mimeType, title)
      try {
        RingtoneManager.setActualDefaultRingtoneUri(context, type, uri)
      } catch (error: SecurityException) {
        throw WriteSettingsDeniedException()
      }
      uri.toString()
    }

    // Opens one app's share screen directly (e.g. WhatsApp's chat picker) with a file from the app
    // cache, shared through this module's FileProvider with a one-off read grant. `text` becomes the
    // caption. Resolves false, opening nothing, when the app is not installed, so the caller can try
    // the next app or the system share sheet.
    AsyncFunction("shareToAppAsync") { fileUri: String, mimeType: String, packageName: String, text: String? ->
      if (!SAFE_PACKAGE_NAME.matches(packageName)) {
        throw InvalidArgumentException("Invalid package name")
      }
      if (!isInstalled(packageName)) return@AsyncFunction false
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      val file = cacheFile(fileUri)
      val contentUri = try {
        FileProvider.getUriForFile(context, context.packageName + FILE_PROVIDER_SUFFIX, file)
      } catch (error: IllegalArgumentException) {
        throw InvalidArgumentException("The file is outside the shared cache folder")
      }
      val intent = Intent(Intent.ACTION_SEND).apply {
        setPackage(packageName)
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, contentUri)
        if (!text.isNullOrBlank()) putExtra(Intent.EXTRA_TEXT, text)
        // ClipData carries the grant reliably on every Android version.
        clipData = ClipData.newRawUri(null, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      try {
        activity.startActivity(intent)
        true
      } catch (error: ActivityNotFoundException) {
        false
      }
    }.runOnQueue(Queues.MAIN)
  }

  // Package visibility for these apps is declared with <queries> in this module's manifest.
  private fun isInstalled(packageName: String): Boolean {
    val manager = context.packageManager
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        manager.getPackageInfo(packageName, PackageManager.PackageInfoFlags.of(0))
      } else {
        @Suppress("DEPRECATION")
        manager.getPackageInfo(packageName, 0)
      }
      true
    } catch (error: PackageManager.NameNotFoundException) {
      false
    }
  }

  // Only files inside this app's cache directory are accepted.
  private fun cacheFile(fileUri: String): File {
    val uri = Uri.parse(fileUri)
    val path = uri.path
    if (uri.scheme != "file" || path == null) {
      throw InvalidArgumentException("Expected a file:// URI")
    }
    val file = File(path).canonicalFile
    val cacheRoot = context.cacheDir.canonicalFile
    if (!file.path.startsWith(cacheRoot.path + File.separator) || !file.isFile) {
      throw InvalidArgumentException("The file must exist inside the app cache")
    }
    return file
  }

  private suspend fun saveToLibrary(
    source: File,
    kind: MediaKind,
    displayName: String,
    mimeType: String,
    title: String
  ): Uri {
    if (!SAFE_FILE_NAME.matches(displayName)) {
      throw InvalidArgumentException("Invalid display name")
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      return withContext(Dispatchers.IO) { saveScoped(source, kind, displayName, mimeType, title) }
    }
    val permission = Manifest.permission.WRITE_EXTERNAL_STORAGE
    val granted = appContext.permissions?.hasGrantedPermissions(permission) == true ||
      askForPermission(permission)
    if (!granted) {
      throw StoragePermissionDeniedException()
    }
    return withContext(Dispatchers.IO) { saveLegacy(source, kind, displayName, mimeType, title) }
  }

  private fun mediaValues(kind: MediaKind, displayName: String, mimeType: String, title: String) =
    ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(MediaStore.MediaColumns.TITLE, title)
      if (kind == MediaKind.AUDIO) {
        // Listed in the system ringtone, notification and alarm pickers, not in music players.
        put(MediaStore.Audio.AudioColumns.IS_RINGTONE, true)
        put(MediaStore.Audio.AudioColumns.IS_NOTIFICATION, true)
        put(MediaStore.Audio.AudioColumns.IS_ALARM, true)
        put(MediaStore.Audio.AudioColumns.IS_MUSIC, false)
      }
    }

  @TargetApi(Build.VERSION_CODES.Q)
  private fun saveScoped(
    source: File,
    kind: MediaKind,
    displayName: String,
    mimeType: String,
    title: String
  ): Uri {
    val resolver = context.contentResolver
    val collection = kind.collection()
    val relativePath = "${kind.directory}/$ALBUM/"
    // Keys are content-addressed, so the same name means the same file: reuse our earlier copy.
    findExisting(
      resolver,
      collection,
      "${MediaStore.MediaColumns.DISPLAY_NAME}=? AND ${MediaStore.MediaColumns.RELATIVE_PATH}=?",
      arrayOf(displayName, relativePath)
    )?.let { return it }

    val values = mediaValues(kind, displayName, mimeType, title).apply {
      put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val uri = resolver.insert(collection, values)
      ?: throw MediaWriteException("MediaStore did not create an entry")
    try {
      val output = resolver.openOutputStream(uri)
        ?: throw MediaWriteException("MediaStore did not open the entry")
      output.use { out -> source.inputStream().use { input -> input.copyTo(out) } }
      val published = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
      resolver.update(uri, published, null, null)
    } catch (error: Exception) {
      resolver.delete(uri, null, null)
      throw if (error is CodedException) error else MediaWriteException("Could not write the file", error)
    }
    return uri
  }

  @Suppress("DEPRECATION")
  private fun saveLegacy(
    source: File,
    kind: MediaKind,
    displayName: String,
    mimeType: String,
    title: String
  ): Uri {
    val resolver = context.contentResolver
    val collection = kind.legacyCollection()
    try {
      val directory = File(Environment.getExternalStoragePublicDirectory(kind.directory), ALBUM)
      if (!directory.isDirectory && !directory.mkdirs()) {
        throw MediaWriteException("Could not create ${directory.path}")
      }
      val target = File(directory, displayName)
      if (!target.isFile || target.length() != source.length()) {
        source.copyTo(target, overwrite = true)
      }
      findExisting(resolver, collection, "${MediaStore.MediaColumns.DATA}=?", arrayOf(target.absolutePath))
        ?.let { return it }
      val values = mediaValues(kind, displayName, mimeType, title).apply {
        put(MediaStore.MediaColumns.DATA, target.absolutePath)
      }
      return resolver.insert(collection, values)
        ?: throw MediaWriteException("MediaStore did not create an entry")
    } catch (error: CodedException) {
      throw error
    } catch (error: Exception) {
      throw MediaWriteException("Could not write the file", error)
    }
  }

  private fun findExisting(
    resolver: ContentResolver,
    collection: Uri,
    selection: String,
    args: Array<String>
  ): Uri? {
    resolver.query(collection, arrayOf(BaseColumns._ID), selection, args, null)?.use { cursor ->
      if (cursor.moveToFirst()) {
        return ContentUris.withAppendedId(collection, cursor.getLong(0))
      }
    }
    return null
  }

  private var settingsWatch: CompletableDeferred<Boolean>? = null

  private suspend fun waitForWriteSettings(): Boolean {
    if (Settings.System.canWrite(context)) return true
    val done = CompletableDeferred<Boolean>()
    settingsWatch?.complete(false)
    settingsWatch = done
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val listener = AppOpsManager.OnOpChangedListener { _, packageName ->
      if (packageName == context.packageName && Settings.System.canWrite(context)) {
        done.complete(true)
      }
    }
    appOps.startWatchingMode(AppOpsManager.OPSTR_WRITE_SETTINGS, context.packageName, listener)
    return try {
      coroutineScope {
        // Some vendor settings screens change the app-op without notifying watchers.
        val poll = launch {
          while (isActive) {
            delay(500)
            if (Settings.System.canWrite(context)) done.complete(true)
          }
        }
        val granted = withTimeoutOrNull(10 * 60_000L) { done.await() } ?: false
        poll.cancel()
        granted
      }
    } finally {
      appOps.stopWatchingMode(listener)
      if (settingsWatch === done) settingsWatch = null
    }
  }

  // A visible picture-in-picture window may start activities; re-launching the singleTask main
  // activity expands it back to full screen over the settings screen.
  private suspend fun returnToApp() = withContext(Dispatchers.Main) {
    val activity = appContext.currentActivity ?: return@withContext
    try {
      activity.startActivity(
        Intent(activity, activity.javaClass).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
      )
    } catch (error: RuntimeException) {
      // Blocked (e.g. the guide window was dismissed); the user returns on their own.
    }
  }

  private fun canUsePictureInPicture(activity: Activity?): Boolean {
    if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
    if (!context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
      return false
    }
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
        Process.myUid(),
        context.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
        AppOpsManager.OPSTR_PICTURE_IN_PICTURE,
        Process.myUid(),
        context.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  // Uses the Expo permissions service, which also runs the WRITE_SETTINGS system-screen flow
  // and resumes when the user comes back to the app.
  private suspend fun askForPermission(permission: String): Boolean {
    val permissions = appContext.permissions ?: return false
    suspendCancellableCoroutine<Unit> { continuation ->
      try {
        permissions.askForPermissions(
          PermissionsResponseListener { _ ->
            if (continuation.isActive) continuation.resume(Unit)
          },
          permission
        )
      } catch (error: IllegalStateException) {
        // Another permission request is already in progress.
        if (continuation.isActive) continuation.resume(Unit)
      }
    }
    return permissions.hasGrantedPermissions(permission)
  }
}
