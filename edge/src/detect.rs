// Euristica "sembra AI" per domini non in catalogo (porting da desktop/src/detect.rs).

/// Words that almost only appear in AI product names/domains.
const AI_WORDS: &[&str] = &["gpt", "llm", "copilot", "chatbot", "genai", "aichat", "openai", "anthropic", "ollama", "huggingface", "diffusion", "deepseek", "mistral", "gemini", "claude", "perplexity", "neural", "agentic"];

/// Local / infrastructure suffixes that are never AI services.
const SKIP_SUFFIX: &[&str] = &[".local", ".lan", ".home", ".internal", ".localdomain", ".arpa", ".home.arpa", ".corp"];

/// Registrable domain ("chat.foo.co.uk" → "foo.co.uk").
pub fn registrable(host: &str) -> String {
    let labels: Vec<&str> = host.trim_end_matches('.').split('.').collect();
    let n = labels.len();
    if n <= 2 {
        return host.trim_end_matches('.').to_string();
    }
    let second = labels[n - 2];
    let take = if labels[n - 1].len() == 2 && ["co", "com", "org", "net", "ac", "gov", "edu"].contains(&second) { 3 } else { 2 };
    labels[n.saturating_sub(take)..].join(".")
}

/// A domain that looks like an AI service but isn't in the catalog. Returns
/// the registrable domain only (never the full host or the page).
pub fn ai_candidate_domain(host: &str) -> Option<String> {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.parse::<std::net::IpAddr>().is_ok() || !host.contains('.') || host == "localhost" || SKIP_SUFFIX.iter().any(|s| host.ends_with(s)) {
        return None;
    }
    if !crate::util::looks_like_hostname(&host) {
        return None;
    }
    let reg = registrable(&host);
    let labels: Vec<&str> = host.split('.').collect();
    let tld = labels.last().copied().unwrap_or("");
    let is_ai = |l: &&str| *l == "ai" || l.starts_with("ai-") || l.ends_with("-ai") || AI_WORDS.iter().any(|w| l.contains(w));
    // The signal is in the registrable domain itself (genspark.ai, supergpt.io): report that.
    let reg_labels: Vec<&str> = reg.split('.').collect();
    if tld == "ai" || reg_labels[..reg_labels.len() - 1].iter().any(is_ai) {
        return Some(reg);
    }
    // Only in a subdomain (ai.acme.com): report the host, so it isn't mistaken for the whole company site.
    labels[..labels.len() - 1].iter().any(is_ai).then(|| host.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates() {
        assert_eq!(ai_candidate_domain("app.genspark.ai").as_deref(), Some("genspark.ai"));
        assert_eq!(ai_candidate_domain("www.supergpt.io").as_deref(), Some("supergpt.io"));
        assert_eq!(ai_candidate_domain("ai.acme.co.uk").as_deref(), Some("ai.acme.co.uk"));
        assert_eq!(ai_candidate_domain("docs-ai.example.com").as_deref(), Some("docs-ai.example.com"));
        assert_eq!(ai_candidate_domain("www.google.com"), None);
        assert_eq!(ai_candidate_domain("mail.airbnb.com"), None);
        assert_eq!(ai_candidate_domain("192.168.1.10"), None);
        assert_eq!(ai_candidate_domain("ai-printer.lan"), None);
        assert_eq!(ai_candidate_domain("4.3.2.1.in-addr.arpa"), None);
    }
}
