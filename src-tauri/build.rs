fn main() {
    if std::env::var("TARGET").as_deref() == Ok("aarch64-apple-ios") {
        use std::{env, path::PathBuf, process::Command};
        println!("cargo:rerun-if-changed=subtitle.swift");
        let out = PathBuf::from(env::var_os("OUT_DIR").unwrap());
        let sdk = Command::new("xcrun").args(["--sdk", "iphoneos", "--show-sdk-path"]).output().unwrap();
        assert!(sdk.status.success(), "Unable to resolve the iOS SDK");
        let sdk = String::from_utf8(sdk.stdout).unwrap();
        let status = Command::new("xcrun")
            .args(["--sdk", "iphoneos", "swiftc", "-target", "arm64-apple-ios14.0", "-sdk", sdk.trim(), "-parse-as-library", "-O", "-emit-library", "-static", "-module-name", "HGhubSubtitles", "subtitle.swift", "-o"])
            .arg(out.join("libhghub_subtitles.a"))
            .status().unwrap();
        assert!(status.success(), "Unable to compile the iOS subtitle bridge");
        println!("cargo:rustc-link-search=native={}", out.display());
        println!("cargo:rustc-link-lib=static=hghub_subtitles");
        println!("cargo:rustc-link-lib=framework=Vision");
    }
    tauri_build::build()
}
