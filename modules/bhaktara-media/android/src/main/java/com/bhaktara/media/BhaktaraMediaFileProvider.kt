package com.bhaktara.media

import androidx.core.content.FileProvider

// A dedicated subclass so this provider never clashes with another library's FileProvider entry
// in the merged manifest. Authority: ${applicationId}.BhaktaraMediaFileProvider.
class BhaktaraMediaFileProvider : FileProvider()
