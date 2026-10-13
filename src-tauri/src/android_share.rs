fn export_mime_type(file_type: &str) -> &'static str {
    match file_type {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "md" => "text/markdown",
        "backup" => "application/json",
        _ => "application/octet-stream",
    }
}

pub fn share_export_path(path: &str, file_type: &str, title: &str) -> Result<(), String> {
    use jni::objects::{JObject, JValue};

    let context = ndk_context::android_context();
    let vm = unsafe { jni::JavaVM::from_raw(context.vm().cast()) }
        .map_err(|error| format!("获取 Android VM 失败: {}", error))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|error| format!("附加 Android 线程失败: {}", error))?;

    // Attached Rust threads do not have the application's Java class loader.
    let android_context = unsafe { JObject::from_raw(context.context().cast()) };
    let loader = env.call_method(&android_context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
        .and_then(|value| value.l())
        .map_err(|error| format!("获取 Android 类加载器失败: {error}"))?;
    let class_name = env.new_string("com.vana.no_visitors.AndroidShare")
        .map_err(|error| format!("创建分享类名失败: {error}"))?;
    let class_object = env.call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;",
        &[JValue::Object(&JObject::from(class_name))])
        .and_then(|value| value.l())
        .map_err(|error| format!("查找分享入口失败: {error}"))?;
    let class = jni::objects::JClass::from(class_object);
    let path = env
        .new_string(path)
        .map_err(|error| format!("创建路径参数失败: {}", error))?;
    let mime_type = env
        .new_string(export_mime_type(file_type))
        .map_err(|error| format!("创建 MIME 参数失败: {}", error))?;
    let title = env
        .new_string(title)
        .map_err(|error| format!("创建标题参数失败: {}", error))?;

    let call_result = env.call_static_method(
        &class,
        "shareExportFile",
        "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V",
        &[
            JValue::Object(&JObject::from(path)),
            JValue::Object(&JObject::from(mime_type)),
            JValue::Object(&JObject::from(title)),
        ],
    );

    if let Err(error) = call_result {
        let java_error = describe_java_exception(&mut env);
        return Err(match java_error {
            Some(message) => format!("调用 Android 分享失败: {}; {}", error, message),
            None => format!("调用 Android 分享失败: {}", error),
        });
    }

    if let Some(message) = read_static_string_field(&mut env, &class, "lastShareError") {
        if !message.trim().is_empty() {
            return Err(message);
        }
    }

    Ok(())
}

fn read_static_string_field(
    env: &mut jni::JNIEnv<'_>,
    class: &jni::objects::JClass<'_>,
    field_name: &str,
) -> Option<String> {
    let field = match env.get_static_field(class, field_name, "Ljava/lang/String;") {
        Ok(value) => value,
        Err(error) => {
            let java_error = describe_java_exception(env);
            return Some(match java_error {
                Some(message) => format!("读取 Android 分享状态失败: {}; {}", error, message),
                None => format!("读取 Android 分享状态失败: {}", error),
            });
        }
    };

    let object = field.l().ok()?;
    if object.is_null() {
        return None;
    }

    env.get_string(&jni::objects::JString::from(object))
        .ok()
        .map(|value| value.to_string_lossy().into_owned())
}

fn describe_java_exception(env: &mut jni::JNIEnv<'_>) -> Option<String> {
    if !env.exception_check().ok()? {
        return None;
    }

    let throwable = env.exception_occurred().ok()?;
    let _ = env.exception_clear();
    let message_object = env
        .call_method(&throwable, "toString", "()Ljava/lang/String;", &[])
        .ok()?
        .l()
        .ok()?;
    let message = env
        .get_string(&jni::objects::JString::from(message_object))
        .ok()?
        .to_string_lossy()
        .into_owned();
    Some(format!("Java 异常: {}", message))
}
