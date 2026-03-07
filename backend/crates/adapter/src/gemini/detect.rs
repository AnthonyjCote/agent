use std::process::Command;

pub fn detect_gemini_cli() -> bool {
    Command::new("gemini")
        .arg("--version")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}
