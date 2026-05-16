//! Fusion model routing module
//!
//! Cross-provider routing based on Claude model type classification.

use crate::database::Database;
use crate::provider::Provider;
use crate::settings::{FusionModelMapping, ModelType};
use serde_json::Value;
use std::sync::Arc;

/// Detect if the request body contains any image content blocks
pub fn body_contains_image(body: &Value) -> bool {
    body.get("messages")
        .and_then(|m| m.as_array())
        .map(|msgs| {
            msgs.iter().any(|msg| {
                msg.get("content")
                    .and_then(|c| c.as_array())
                    .map(|blocks| {
                        blocks.iter().any(|b| {
                            b.get("type").and_then(|t| t.as_str()) == Some("image")
                        })
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

/// Classify a model name into a Claude model type (case-insensitive)
pub fn classify_model_type(model: &str) -> ModelType {
    let lower = model.to_lowercase();
    if lower.contains("haiku") {
        ModelType::Haiku
    } else if lower.contains("sonnet") {
        ModelType::Sonnet
    } else if lower.contains("opus") {
        ModelType::Opus
    } else {
        ModelType::Default
    }
}

/// Resolve fusion mapping for a request.
/// - If `auto_image_to_haiku` is enabled and the body contains images → force Haiku type
/// - Otherwise, classify by model name
/// Returns `Some((provider, model_name))` if fusion routing applies, `None` otherwise.
pub async fn try_fusion_route(
    db: &Arc<Database>,
    app_type_str: &str,
    fusion: &FusionModelMapping,
    request_model: &str,
    request_body: &Value,
) -> Result<Option<(Provider, String)>, crate::error::AppError> {
    if !fusion.enabled {
        return Ok(None);
    }

    // Image → Haiku auto-routing
    let model_type = if fusion.auto_image_to_haiku && body_contains_image(request_body) {
        log::debug!(
            "[Fusion] Detected image in request, forcing Haiku routing (model={})",
            request_model
        );
        ModelType::Haiku
    } else {
        classify_model_type(request_model)
    };

    let entry = match model_type {
        ModelType::Haiku => &fusion.haiku,
        ModelType::Sonnet => &fusion.sonnet,
        ModelType::Opus => &fusion.opus,
        ModelType::Default => &fusion.default,
    };

    let Some(entry) = entry else {
        return Ok(None);
    };

    let provider = db
        .get_provider_by_id(&entry.provider_id, app_type_str)?
        .ok_or_else(|| {
            crate::error::AppError::Config(format!(
                "Fusion mapping: provider {} not found for app {}",
                entry.provider_id, app_type_str
            ))
        })?;

    Ok(Some((provider, entry.model_name.clone())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_haiku() {
        assert_eq!(classify_model_type("claude-haiku-4-5"), ModelType::Haiku);
    }

    #[test]
    fn classify_sonnet() {
        assert_eq!(
            classify_model_type("claude-sonnet-4-5-20250929"),
            ModelType::Sonnet
        );
    }

    #[test]
    fn classify_opus() {
        assert_eq!(classify_model_type("claude-opus-4-5"), ModelType::Opus);
    }

    #[test]
    fn classify_default() {
        assert_eq!(classify_model_type("some-unknown-model"), ModelType::Default);
    }

    #[test]
    fn classify_case_insensitive() {
        assert_eq!(classify_model_type("Claude-SONNET-4-5"), ModelType::Sonnet);
    }

    #[test]
    fn detect_image_in_content_array() {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": "describe this"},
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": "abc"}}
                ]
            }]
        });
        assert!(body_contains_image(&body));
    }

    #[test]
    fn no_image_in_text_only() {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "messages": [{
                "role": "user",
                "content": [{"type": "text", "text": "hello"}]
            }]
        });
        assert!(!body_contains_image(&body));
    }

    #[test]
    fn no_image_when_content_is_string() {
        let body = serde_json::json!({
            "model": "claude-sonnet-4-5",
            "messages": [{
                "role": "user",
                "content": "hello world"
            }]
        });
        assert!(!body_contains_image(&body));
    }
}
