plugins { alias(libs.plugins.android.application) }
val localAuthenticationAssets = providers.environmentVariable("DIPLAY_AUTH_ASSETS_DIR")
    .orNull?.let { file(it).canonicalFile }
android {
    namespace = "com.diplay.tesla"
    compileSdk = 37
    defaultConfig {
        applicationId = "com.diplay.tesla"
        minSdk = 25
        targetSdk = 37
        versionCode = 11
        versionName = "0.1.10"
    }
    localAuthenticationAssets?.let { sourceSets.getByName("main").assets.srcDir(it) }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    signingConfigs {
        create("release") {
            storeFile = file(providers.environmentVariable("ANDROID_KEYSTORE_PATH")
                .getOrElse("missing-tesla-release-keystore.jks"))
            storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").getOrElse("")
            keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").getOrElse("")
            keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").getOrElse("")
        }
    }
    buildTypes {
        debug { applicationIdSuffix = ".debug" }
        release { signingConfig = signingConfigs.getByName("release") }
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
}
dependencies {
    implementation(project(":common"))
    implementation(project(":browser"))
    testImplementation(libs.junit)
    testImplementation("org.robolectric:robolectric:4.17")
}
val credentialAssets = files(android.sourceSets.flatMap { source -> source.assets.directories.map { directory ->
    fileTree(directory) {
        include("**/offline-mfi/**", "**/*.pk8", "**/*.p7b", "**/*.key", "**/*.pem",
            "**/*.p12", "**/*.pfx", "**/*.jks", "**/*.keystore")
    }
} })
val rejectBundledCredentials by tasks.registering {
    val filesToCheck = credentialAssets
    val allowed = localAuthenticationAssets?.let { dir ->
        setOf(dir.resolve("offline-mfi/identity.pk8").canonicalFile, dir.resolve("offline-mfi/certificate.p7b").canonicalFile)
    }.orEmpty()
    inputs.files(filesToCheck)
    doLast {
        check(allowed.all { it.isFile && it.length() > 0 }) { "Incomplete local authentication assets" }
        val unexpected = filesToCheck.files.filter { it.canonicalFile !in allowed }
        check(unexpected.isEmpty()) { "Unexpected credential files in APK assets" }
    }
}
tasks.named("preBuild") { dependsOn(rejectBundledCredentials) }
val verifyStandaloneAuthentication by tasks.registering {
    val directory = localAuthenticationAssets
    doLast {
        check(directory != null) { "Set DIPLAY_AUTH_ASSETS_DIR for standalone CarPlay" }
        check(listOf("identity.pk8", "certificate.p7b").all {
            directory.resolve("offline-mfi/$it").let { file -> file.isFile && file.length() > 0 }
        }) { "Standalone CarPlay authentication files are missing or empty" }
    }
}
tasks.named("preBuild") { mustRunAfter(verifyStandaloneAuthentication) }
tasks.register("assembleStandaloneDebug") { dependsOn(verifyStandaloneAuthentication, "assembleDebug") }
tasks.register("assembleStandaloneRelease") {
    group = "build"
    description = "Build a signed Tesla APK with explicitly provisioned authentication."
    dependsOn(verifyStandaloneAuthentication, "assembleRelease")
}
