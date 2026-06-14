use crate::infer::parse_positive_integer_text;
use crate::utils::clean_cell_text;
use crate::utils::json_cell_ref;
use crate::utils::json_number;
use crate::utils::json_string;
use crate::utils::json_usize;
use crate::utils::json_usize_array;
use crate::utils::normalize_header_compact;
use serde_json::json;
use serde_json::Value;

// Branch family: semantic-columns
// These rules classify columns by label meaning, such as voltage/current/frequency/
// capacitance, and are used when detection falls back to semantic matching.
pub(crate) fn detect_axis_role_text(value: &str) -> Option<&'static str> {
    crate::assessment::detect_axis_role_text(value)
}

pub(crate) fn is_voltage_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "v"
        || compact == "vp"
        || compact == "vpn"
        || compact == "vg"
        || compact == "vd"
        || compact.starts_with("vbias")
        || compact.contains("voltage")
}

pub(crate) fn is_frequency_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact.contains("freq") || compact.contains("frequency") || compact.contains("hz")
}

pub(crate) fn is_capacitance_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "cp"
        || compact == "cs"
        || compact.starts_with("cp")
        || compact.starts_with("cs")
        || compact.contains("cap")
}

pub(crate) fn is_current_like_header(value: &str) -> bool {
    let compact = normalize_header_compact(value);
    compact == "in"
        || compact == "ipt"
        || compact == "id"
        || compact == "ig"
        || compact.starts_with("id")
        || compact.starts_with("ig")
        || compact.contains("current")
        || compact.starts_with("in")
        || compact.starts_with("ipt")
}

// Branch family: adjacent-pair / pair-candidates
// These rules look at header shape rather than only device meaning, for example
// whether a header specifically looks like drain current or whether a pair uses
// structured x/y suffixes.
pub(crate) fn current_header_looks_like_drain_current(value: &str) -> bool {
    let normalized = clean_cell_text(value).to_lowercase();
    let compact = normalize_header_compact(value);
    compact == "id"
        || compact.starts_with("id")
        || compact == "draincurrent"
        || compact == "totalcurrent"
        || compact == "draini"
        || normalized.contains("drain current")
        || (normalized.contains("drain") && normalized.contains("current"))
        || normalized.contains("totalcurrent")
}

pub(crate) fn current_header_looks_like_gate_current(value: &str) -> bool {
    let normalized = clean_cell_text(value).to_lowercase();
    let compact = normalize_header_compact(value);
    compact == "ig"
        || compact.starts_with("ig")
        || compact == "gatecurrent"
        || compact == "gatei"
        || normalized.contains("gate current")
        || (normalized.contains("gate") && normalized.contains("current"))
}

pub(crate) fn structured_axis_suffix(header: &str) -> (Option<&'static str>, String) {
    let trimmed = clean_cell_text(header);
    if trimmed.is_empty() {
        return (None, String::new());
    }
    let lower = trimmed.to_lowercase();
    let mut chars = lower.chars().collect::<Vec<_>>();
    let Some(last) = chars.pop() else {
        return (None, lower);
    };
    if last != 'x' && last != 'y' {
        return (None, lower);
    }
    while chars
        .last()
        .map(|ch| ch.is_whitespace() || "_-./()[]{}:=".contains(*ch))
        .unwrap_or(false)
    {
        chars.pop();
    }
    let stem: String = chars.into_iter().collect();
    if stem.is_empty() {
        return (None, lower);
    }
    (Some(if last == 'x' { "x" } else { "y" }), stem)
}

// Branch family: stripped-sweep / generated-legend metadata
// These rules parse numeric hints out of metadata text instead of inferring from
// table layout alone.
pub(crate) fn parse_voltage_like_value(raw: &str) -> Option<f64> {
    let text = clean_cell_text(raw).to_lowercase();
    if text.is_empty() {
        return None;
    }
    let mut number = String::new();
    let mut unit = String::new();
    let mut in_number = false;
    for ch in text.chars() {
        if ch.is_ascii_digit() || matches!(ch, '-' | '+' | '.' | 'e') {
            number.push(ch);
            in_number = true;
        } else if in_number {
            if ch.is_alphabetic() || ch == 'μ' || ch == '渭' {
                unit.push(ch);
            } else if !unit.is_empty() {
                break;
            }
        }
    }
    let value = number.parse::<f64>().ok()?;
    let factor = match unit.as_str() {
        "mv" => 1e-3,
        "uv" | "μv" | "渭v" => 1e-6,
        "kv" => 1e3,
        _ => 1.0,
    };
    Some(value * factor)
}

pub(crate) fn parse_var_sweep_from_notes(
    notes: &str,
    var_tag: &str,
) -> Option<(Option<usize>, Option<f64>, Option<f64>)> {
    let lower = notes.to_lowercase();
    let needle = format!("[{}]", var_tag.to_lowercase());
    let start = lower.find(&needle)?;
    let rest = &notes[start + needle.len()..];
    let end = rest.find('[').unwrap_or(rest.len());
    let block = &rest[..end];
    let block_lower = block.to_lowercase();
    let field = |name: &str| -> Option<String> {
        let index = block_lower.find(&name.to_lowercase())?;
        Some(
            block[index + name.len()..]
                .split([',', '\t', ']'])
                .next()
                .unwrap_or("")
                .to_string(),
        )
    };
    let start_value = field("Start=").and_then(|value| parse_voltage_like_value(&value));
    let step = field("Step=").and_then(|value| parse_voltage_like_value(&value));
    let count = field("No. of Steps=").and_then(|value| parse_positive_integer_text(&value));
    if start_value.is_none() && step.is_none() && count.is_none() {
        None
    } else {
        Some((count, start_value, step))
    }
}

// Branch family: result labeling
// These rules convert detected axis/curve meaning into normalized labels used by
// downstream configs and summaries.
pub(crate) fn detect_axis_role(text: &str) -> (Option<&'static str>, &'static str) {
    let normalized = text.to_ascii_lowercase();
    if normalized.contains("vd") || normalized.contains("v_d") || normalized.contains("drain") {
        return (Some("vd"), "label");
    }
    if normalized.contains("vg")
        || normalized.contains("v_g")
        || normalized.contains("gate")
        || normalized.contains("var1")
    {
        return (Some("vg"), "label");
    }
    (None, "metadata")
}

pub(crate) fn format_compact_number(value: f64) -> String {
    if !value.is_finite() {
        return String::new();
    }
    let text = format!("{:.12}", value);
    text.trim_end_matches('0').trim_end_matches('.').to_string()
}

pub(crate) fn build_auto_curve_type_label(curve_type: &str, x_axis_role: Option<&str>) -> Value {
    match curve_type {
        "transfer" => {
            if x_axis_role == Some("vg") {
                json!("transfer (vg)")
            } else {
                json!("transfer")
            }
        }
        "output" => {
            if x_axis_role == Some("vd") {
                json!("output (vd)")
            } else {
                json!("output")
            }
        }
        "pv" | "cv" | "cf" => json!(curve_type),
        _ => json!("unknown"),
    }
}

// Branch family: result packaging
// These rules do not choose a detection strategy; they annotate the config that
// was already detected so the UI can tell which branch won and how confident it was.
pub(crate) fn with_auto_curve_info(
    mut config: Value,
    curve_type: &str,
    x_axis_role: Option<&str>,
    x_axis_role_source: &str,
    confidence: &str,
    needs_template: bool,
) -> Value {
    if let Some(object) = config.as_object_mut() {
        object.insert("autoCurveType".to_string(), json!(curve_type));
        object.insert(
            "autoCurveTypeLabel".to_string(),
            build_auto_curve_type_label(curve_type, x_axis_role),
        );
        object.insert("autoCurveConfidence".to_string(), json!(confidence));
        object.insert("autoCurveNeedsTemplate".to_string(), json!(needs_template));
        object.insert("autoXAxisRoleSource".to_string(), json!(x_axis_role_source));
    }
    config
}

fn nullable_non_empty_json_string(value: String) -> Value {
    if value.trim().is_empty() {
        Value::Null
    } else {
        json!(value)
    }
}

// Branch family: plan summary
// This is a normalized, UI-facing projection of an already detected config. It
// helps inspect which branch shape the detector settled on without rerunning detection.
pub(crate) fn infer_auto_extraction_plan_from_config(config: &Value) -> Value {
    let bottom_title = json_string(config.get("bottomTitle"));
    let left_title = json_string(config.get("leftTitle"));
    let x_axis_role = match detect_axis_role_text(&bottom_title) {
        Some(role) => json!(role),
        None => Value::Null,
    };
    let curve_type_raw = json_string(config.get("autoCurveType")).to_ascii_lowercase();
    let curve_type = match curve_type_raw.as_str() {
        "transfer" | "output" | "cv" | "cf" | "pv" => curve_type_raw,
        _ => match x_axis_role.as_str() {
            Some("vg") => "transfer".to_string(),
            Some("vd") => "output".to_string(),
            _ => "unknown".to_string(),
        },
    };
    let legend_start_cell = json_cell_ref(config.get("yLegendStartCell"));
    let legend_start_value =
        nullable_non_empty_json_string(json_string(config.get("yLegendStartValue")));
    let legend_count = json_usize(config.get("yLegendCount"));
    let legend_step = config.get("yLegendStep").and_then(json_number);
    let group_size = json_usize(config.get("groupSize"));
    let legend_target = {
        let target = json_string(config.get("yLegendTarget"));
        if target.is_empty() {
            "auto".to_string()
        } else {
            target
        }
    };
    let start_row = json_usize(config.get("startRow")).unwrap_or(0);
    let legend_start_row_index = legend_start_cell.map(|(row, _)| row).or_else(|| {
        if !legend_start_value.is_null() && legend_target == "group" {
            Some(start_row)
        } else {
            None
        }
    });
    let groups = if group_size.is_some()
        || legend_target != "yColumn"
        || matches!(curve_type.as_str(), "cv" | "cf" | "pv")
    {
        json_usize(config.get("groups"))
    } else {
        None
    };
    let confidence = {
        let value = json_string(config.get("autoCurveConfidence"));
        if value.is_empty() {
            if curve_type == "unknown" {
                "low".to_string()
            } else {
                "medium".to_string()
            }
        } else {
            value
        }
    };
    let x_axis_role_source = {
        let value = json_string(config.get("autoXAxisRoleSource"));
        if value.is_empty() {
            "metadata".to_string()
        } else {
            value
        }
    };

    json!({
        "bottomTitle": bottom_title,
        "confidence": confidence,
        "curveType": curve_type,
        "curveTypeLabel": config
            .get("autoCurveTypeLabel")
            .cloned()
            .unwrap_or_else(|| build_auto_curve_type_label(&curve_type, x_axis_role.as_str())),
        "dataStartRowIndex": start_row,
        "groups": groups,
        "leftTitle": left_title,
        "legendPrefix": json_string(config.get("legendPrefix")),
        "legendStartColIndex": legend_start_cell.map(|(_, col)| col),
        "legendStartRowIndex": legend_start_row_index,
        "legendStartValue": legend_start_value,
        "legendCount": legend_count,
        "legendStep": legend_step,
        "legendTarget": legend_target,
        "needsTemplate": config
            .get("autoCurveNeedsTemplate")
            .and_then(Value::as_bool)
            .unwrap_or(curve_type == "unknown"),
        "reasons": Vec::<String>::new(),
        "xAxisRole": x_axis_role,
        "xAxisRoleSource": x_axis_role_source,
        "xCol": json_usize(config.get("xCol")).unwrap_or(0),
        "xPointsPerGroup": group_size,
        "xSegmentationMode": json_string(config.get("xSegmentationMode")),
        "xUnit": json_string(config.get("xUnit")),
        "yCols": json_usize_array(config.get("yCols")),
        "yUnit": json_string(config.get("yUnit")),
    })
}
