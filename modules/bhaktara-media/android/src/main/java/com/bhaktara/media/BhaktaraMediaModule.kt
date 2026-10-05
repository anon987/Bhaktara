package com.bhaktara.media

import android.Manifest
import android.annotation.TargetApi
import android.app.WallpaperManager
import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.BaseColumns
import android.provider.MediaStore
import android.provider.Settings
import expo.modules.interfaces.permissions.PermissionsResponseListener
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

// Saved media lands in a "Bhaktara" folder inside the standard public directory for its kind.
private const val ALBUM = "Bhaktara"
private val SAFE_FILE_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

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
