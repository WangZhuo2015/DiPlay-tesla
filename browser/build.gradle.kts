plugins { id("com.android.library") }
android {
    namespace = "com.diplay.browser"
    compileSdk = 37
    defaultConfig {
        minSdk = 25
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    testOptions { unitTests.isIncludeAndroidResources = true }
}
dependencies {
    api(project(":shared"))
    implementation("org.nanohttpd:nanohttpd:2.3.1")
    testImplementation(libs.junit)
    testImplementation("org.robolectric:robolectric:4.17")
    androidTestImplementation("androidx.test:runner:1.7.0")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
}
