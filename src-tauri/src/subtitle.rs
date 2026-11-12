#[cfg(all(target_os = "ios", target_arch = "aarch64", target_abi = ""))]
mod native {
    use std::ffi::{CStr, CString, c_char};
    use tokio::sync::oneshot;

    type Sender = oneshot::Sender<Result<String, String>>;
    extern "C" {
        fn hghub_read_subtitle(input: *const c_char) -> *mut c_char;
        fn hghub_free_subtitle(text: *mut c_char);
        fn hghub_translate_subtitle(
            input: *const c_char,
            callback: extern "C" fn(u64, *const c_char, *const c_char),
            id: u64,
        );
    }

    pub async fn read(jpeg: String) -> Result<String, String> {
        if jpeg.len() > 750_000 { return Err("Subtitle image is too large.".into()); }
        let input = CString::new(jpeg).map_err(|_| "Invalid subtitle image.")?;
        tauri::async_runtime::spawn_blocking(move || unsafe {
            let output = hghub_read_subtitle(input.as_ptr());
            if output.is_null() { return Err("Could not read the subtitle image.".into()); }
            let text = CStr::from_ptr(output).to_string_lossy().into_owned();
            hghub_free_subtitle(output);
            Ok(text)
        }).await.map_err(|_| "Subtitle recognition stopped.".to_string())?
    }

    extern "C" fn receive(id: u64, text: *const c_char, error: *const c_char) {
        unsafe {
            let sender = Box::from_raw(id as *mut Sender);
            let read = |p| CStr::from_ptr(p).to_string_lossy().into_owned();
            let result = if !error.is_null() { Err(read(error)) }
                else if !text.is_null() { Ok(read(text)) }
                else { Err("Translation returned no text.".into()) };
            let _ = sender.send(result);
        }
    }

    pub async fn translate(text: String) -> Result<String, String> {
        if text.len() > 4096 { return Err("Subtitle text is too long.".into()); }
        let input = CString::new(text).map_err(|_| "Invalid subtitle text.")?;
        let (sender, receiver) = oneshot::channel();
        let id = Box::into_raw(Box::new(sender)) as u64;
        unsafe { hghub_translate_subtitle(input.as_ptr(), receive, id) };
        receiver.await.map_err(|_| "Translation stopped.".to_string())?
    }
}

#[tauri::command]
pub async fn read_subtitle(jpeg: String) -> Result<String, String> {
    #[cfg(all(target_os = "ios", target_arch = "aarch64", target_abi = ""))]
    return native::read(jpeg).await;
    #[cfg(not(all(target_os = "ios", target_arch = "aarch64", target_abi = "")))]
    { let _ = jpeg; Err("Subtitles require an iPhone.".into()) }
}

#[tauri::command]
pub async fn translate_subtitle(text: String) -> Result<String, String> {
    #[cfg(all(target_os = "ios", target_arch = "aarch64", target_abi = ""))]
    return native::translate(text).await;
    #[cfg(not(all(target_os = "ios", target_arch = "aarch64", target_abi = "")))]
    { let _ = text; Err("Subtitles require an iPhone.".into()) }
}
