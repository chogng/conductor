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
