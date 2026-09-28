// The angar window: set-up, update, notices. One small, frameless, dark
// window in the angar style (same fonts, colours and logo as the web app),
// drawn with egui. If the computer can't open it (no OpenGL, e.g. some remote
// desktops) the caller falls back to the plain system dialogs in ui.rs.
use crate::config::Config;
use crate::{install, join, valid_email, VERSION};
use eframe::egui::{
    self, pos2, vec2, Align2, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId, Key, Margin, Pos2, Rect, Sense, Shape, Stroke, UiBuilder, Vec2,
};
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::mpsc::{channel, Receiver};
use std::sync::Arc;
use std::time::Instant;

// Palette of the web app (dark theme).
const BG: Color32 = Color32::from_rgb(0x1A, 0x1C, 0x1D);
const PANEL: Color32 = Color32::from_rgb(0x20, 0x23, 0x27);
const RAISED: Color32 = Color32::from_rgb(0x28, 0x2B, 0x30);
const LINE: Color32 = Color32::from_rgb(0x34, 0x38, 0x3D);
const TEXT: Color32 = Color32::from_rgb(0xED, 0xED, 0xEF);
const MUTED: Color32 = Color32::from_rgb(0x9C, 0xA0, 0xA8);
const FAINT: Color32 = Color32::from_rgb(0x6E, 0x72, 0x7A);
const ACCENT: Color32 = Color32::from_rgb(0xFF, 0x73, 0x23);
const ACCENT_HOVER: Color32 = Color32::from_rgb(0xFF, 0x86, 0x42);
const GREEN: Color32 = Color32::from_rgb(0x3F, 0xB6, 0x7A);
const RED: Color32 = Color32::from_rgb(0xE5, 0x62, 0x5A);

const PAD: f32 = 32.0;
const HEADER: f32 = 52.0;

// ---------------------------------------------------------------- public API

pub struct SetupInput {
    pub cfg: Config,
    pub code: Option<String>,
    /// --join was passed: link again even if already linked.
    pub join_explicit: bool,
    pub email_arg: Option<String>,
    pub email_domain: Option<String>,
    pub no_install: bool,
}

pub enum Outcome {
    /// Finished (or closed): nothing else to do.
    Exit,
    /// Couldn't install in the background: keep running in this process.
    RunForeground(Config),
}

/// Runs the set-up window. Err = the window couldn't open (use the plain dialogs).
pub fn setup(input: SetupInput) -> Result<Outcome, String> {
    let out = Rc::new(RefCell::new(Outcome::Exit));
    let out2 = out.clone();
    run(vec2(460.0, 600.0), move |_| Box::new(Setup::new(input, out2)))?;
    Ok(Rc::try_unwrap(out).map(RefCell::into_inner).unwrap_or(Outcome::Exit))
}

#[derive(Clone, Copy)]
#[allow(dead_code)]
pub enum Tone {
    Info,
    Success,
    Warning,
}

/// A single message (company notice, uninstall confirmation).
pub fn message(title: &str, body: &str, tone: Tone) -> Result<(), String> {
    let (title, body) = (title.to_string(), body.to_string());
    let lines = body.len() / 48 + body.matches('\n').count();
    let h = (330.0 + lines as f32 * 21.0).clamp(330.0, 560.0);
    run(vec2(440.0, h), move |_| Box::new(Message { title, body, tone }))
}

// ---------------------------------------------------------------- window

fn run(size: Vec2, make: impl FnOnce(&egui::Context) -> Box<dyn eframe::App> + 'static) -> Result<(), String> {
    let mut viewport = egui::ViewportBuilder::default()
        .with_title("angar")
        .with_app_id("angar")
        .with_inner_size(size)
        .with_resizable(false)
        .with_maximize_button(false)
        .with_decorations(false)
        .with_active(true);
    if let Ok(icon) = eframe::icon_data::from_png_bytes(include_bytes!("../assets/angar.png")) {
        viewport = viewport.with_icon(Arc::new(icon));
    }
    let options = eframe::NativeOptions { viewport, centered: true, ..Default::default() };
    eframe::run_native(
        "angar",
        options,
        Box::new(move |cc| {
            #[cfg(windows)]
            round_corners(cc);
            style(&cc.egui_ctx);
            Ok(make(&cc.egui_ctx))
        }),
    )
    .map_err(|e| e.to_string())
}

/// Windows 11: rounded corners and shadow for the frameless window.
#[cfg(windows)]
fn round_corners(cc: &eframe::CreationContext) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND};
    if let Ok(h) = cc.window_handle() {
        if let RawWindowHandle::Win32(w) = h.as_raw() {
            let pref: i32 = DWMWCP_ROUND;
            unsafe {
                DwmSetWindowAttribute(w.hwnd.get() as _, DWMWA_WINDOW_CORNER_PREFERENCE as u32, &pref as *const i32 as *const _, 4);
            }
        }
    }
}

fn style(ctx: &egui::Context) {
    let mut fonts = FontDefinitions::default();
    let add = |f: &mut FontDefinitions, name: &str, bytes: &'static [u8]| {
        f.font_data.insert(name.into(), Arc::new(FontData::from_static(bytes)));
    };
    add(&mut fonts, "hk", include_bytes!("../assets/fonts/Hanken-Regular.ttf"));
    add(&mut fonts, "hk-medium", include_bytes!("../assets/fonts/Hanken-Medium.ttf"));
    add(&mut fonts, "hk-semi", include_bytes!("../assets/fonts/Hanken-SemiBold.ttf"));
    add(&mut fonts, "brand", include_bytes!("../assets/fonts/SpaceGrotesk-SemiBold.ttf"));
    let fallback = fonts.families.get(&FontFamily::Proportional).cloned().unwrap_or_default();
    let family = |first: &str| std::iter::once(first.to_string()).chain(fallback.iter().cloned()).collect::<Vec<_>>();
    fonts.families.insert(FontFamily::Proportional, family("hk"));
    fonts.families.insert(FontFamily::Name("medium".into()), family("hk-medium"));
    fonts.families.insert(FontFamily::Name("semi".into()), family("hk-semi"));
    fonts.families.insert(FontFamily::Name("brand".into()), family("brand"));
    ctx.set_fonts(fonts);

    ctx.set_visuals(egui::Visuals::dark());
    ctx.all_styles_mut(|s| {
        let v = &mut s.visuals;
        v.panel_fill = BG;
        v.window_fill = BG;
        v.extreme_bg_color = PANEL;
        v.override_text_color = Some(TEXT);
        v.selection.bg_fill = ACCENT.gamma_multiply(0.35);
        v.selection.stroke = Stroke::new(1.0, ACCENT);
        v.text_cursor.stroke = Stroke::new(1.5, ACCENT);
        for w in [&mut v.widgets.inactive, &mut v.widgets.hovered, &mut v.widgets.active, &mut v.widgets.noninteractive] {
            w.corner_radius = CornerRadius::same(8);
            w.bg_stroke = Stroke::new(1.0, LINE);
        }
        v.widgets.hovered.bg_stroke = Stroke::new(1.0, FAINT);
        s.spacing.item_spacing = vec2(8.0, 8.0);
        s.interaction.selectable_labels = false;
    });
}

fn font(size: f32) -> FontId {
    FontId::proportional(size)
}
fn font_of(family: &str, size: f32) -> FontId {
    FontId::new(size, FontFamily::Name(family.into()))
}

// ---------------------------------------------------------------- drawing

/// The angar mark (two chevrons around a bar), from the web logo paths,
/// split into convex pieces.
fn logo(p: &egui::Painter, left_top: Pos2, height: f32, color: Color32) {
    let s = height / 330.0;
    let at = |x: f32, y: f32| pos2(left_top.x + (x - 55.0) * s, left_top.y + (y - 28.0) * s);
    let left: [&[(f32, f32)]; 4] = [
        &[(152.0, 28.0), (212.0, 28.0), (212.0, 92.0), (188.0, 92.0)],
        &[(152.0, 28.0), (188.0, 92.0), (128.6, 193.0), (55.0, 193.0)],
        &[(55.0, 193.0), (128.6, 193.0), (188.0, 294.0), (152.0, 358.0)],
        &[(188.0, 294.0), (212.0, 294.0), (212.0, 358.0), (152.0, 358.0)],
    ];
    for piece in left {
        p.add(Shape::convex_polygon(piece.iter().map(|&(x, y)| at(x, y)).collect(), color, Stroke::NONE));
        // Mirror for the right chevron (the mark is symmetric around x = 247).
        p.add(Shape::convex_polygon(piece.iter().rev().map(|&(x, y)| at(494.0 - x, y)).collect(), color, Stroke::NONE));
    }
    p.add(Shape::convex_polygon(vec![at(212.0, 92.0), at(282.0, 92.0), at(282.0, 294.0), at(212.0, 294.0)], color, Stroke::NONE));
}

/// Logo + "angar" + close button; dragging it moves the window.
fn header(ui: &mut egui::Ui) {
    let full = ui.max_rect();
    let bar = Rect::from_min_size(full.min, vec2(full.width(), HEADER));
    let drag = ui.interact(bar, ui.id().with("drag"), Sense::click_and_drag());
    if drag.drag_started() {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
    }
    let p = ui.painter();
    // Stesse proporzioni della piattaforma: nome al 90% del logo, spazio al 40%, centrati.
    let mark_h = 20.0;
    logo(p, pos2(bar.left() + 22.0, bar.center().y - mark_h / 2.0), mark_h, TEXT);
    p.text(pos2(bar.left() + 22.0 + mark_h * 1.146 + mark_h * 0.4, bar.center().y), Align2::LEFT_CENTER, "angar", font_of("brand", mark_h * 0.9), TEXT);

    let close = Rect::from_center_size(pos2(bar.right() - 26.0, bar.center().y), vec2(32.0, 32.0));
    let r = ui.interact(close, ui.id().with("close"), Sense::click()).on_hover_cursor(egui::CursorIcon::PointingHand);
    let p = ui.painter();
    if r.hovered() {
        p.rect_filled(close, CornerRadius::same(8), RAISED);
    }
    let c = close.center();
    let (k, col) = (5.0, if r.hovered() { TEXT } else { MUTED });
    p.line_segment([c + vec2(-k, -k), c + vec2(k, k)], Stroke::new(1.5, col));
    p.line_segment([c + vec2(k, -k), c + vec2(-k, k)], Stroke::new(1.5, col));
    if r.clicked() {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
    }
    p.line_segment([pos2(full.left(), bar.bottom()), pos2(full.right(), bar.bottom())], Stroke::new(1.0, LINE));
}

#[derive(Clone, Copy)]
enum Icon {
    Check,
    Alert,
    Info,
    Update,
    Logo,
}

/// Round badge with an icon, e.g. the big tick on "You're all set".
fn badge(ui: &mut egui::Ui, icon: Icon, color: Color32) {
    let (rect, _) = ui.allocate_exact_size(vec2(56.0, 56.0), Sense::hover());
    let p = ui.painter();
    let c = rect.center();
    p.circle_filled(c, 28.0, color.gamma_multiply(0.14));
    p.circle_stroke(c, 27.5, Stroke::new(1.0, color.gamma_multiply(0.45)));
    draw_icon(p, c, 11.0, icon, color, 2.4);
}

fn draw_icon(p: &egui::Painter, c: Pos2, k: f32, icon: Icon, color: Color32, w: f32) {
    let st = Stroke::new(w, color);
    match icon {
        Icon::Check => {
            p.add(Shape::line(vec![c + vec2(-k * 0.95, 0.05 * k), c + vec2(-k * 0.3, k * 0.7), c + vec2(k * 0.95, -k * 0.65)], st));
        }
        Icon::Alert => {
            p.line_segment([c + vec2(0.0, -k * 0.85), c + vec2(0.0, k * 0.25)], st);
            p.circle_filled(c + vec2(0.0, k * 0.8), w * 0.65, color);
        }
        Icon::Info => {
            p.circle_filled(c + vec2(0.0, -k * 0.8), w * 0.65, color);
            p.line_segment([c + vec2(0.0, -k * 0.25), c + vec2(0.0, k * 0.85)], st);
        }
        Icon::Update => {
            // Arrow up onto a baseline.
            p.line_segment([c + vec2(0.0, -k * 0.9), c + vec2(0.0, k * 0.45)], st);
            p.add(Shape::line(vec![c + vec2(-k * 0.55, -k * 0.35), c + vec2(0.0, -k * 0.9), c + vec2(k * 0.55, -k * 0.35)], st));
            p.line_segment([c + vec2(-k * 0.8, k * 0.95), c + vec2(k * 0.8, k * 0.95)], st);
        }
        Icon::Logo => {
            let h = k * 1.9;
            logo(p, c - vec2(h * 1.16 / 2.0, h / 2.0), h, color);
        }
    }
}

fn title(ui: &mut egui::Ui, text: &str) {
    ui.label(egui::RichText::new(text).font(font_of("semi", 24.0)).color(TEXT));
}
fn body(ui: &mut egui::Ui, text: &str) {
    ui.label(egui::RichText::new(text).font(font(15.0)).color(MUTED).line_height(Some(22.0)));
}

#[derive(PartialEq)]
enum Kind {
    Primary,
    Secondary,
}

fn button(ui: &mut egui::Ui, text: &str, kind: Kind, enabled: bool) -> bool {
    let (rect, r) = ui.allocate_exact_size(vec2(ui.available_width(), 44.0), if enabled { Sense::click() } else { Sense::hover() });
    let r = if enabled { r.on_hover_cursor(egui::CursorIcon::PointingHand) } else { r };
    let p = ui.painter();
    let hover = enabled && r.hovered();
    match kind {
        Kind::Primary => {
            let fill = if !enabled { ACCENT.gamma_multiply(0.35) } else if hover { ACCENT_HOVER } else { ACCENT };
            p.rect_filled(rect, CornerRadius::same(10), fill);
            p.text(rect.center(), Align2::CENTER_CENTER, text, font_of("semi", 15.0), if enabled { Color32::WHITE } else { Color32::from_white_alpha(150) });
        }
        Kind::Secondary => {
            p.rect(rect, CornerRadius::same(10), if hover { RAISED } else { Color32::TRANSPARENT }, Stroke::new(1.0, if hover { FAINT } else { LINE }), egui::StrokeKind::Inside);
            p.text(rect.center(), Align2::CENTER_CENTER, text, font_of("medium", 15.0), TEXT);
        }
    }
    enabled && r.clicked()
}

fn card(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui)) {
    egui::Frame::new()
        .fill(PANEL)
        .stroke(Stroke::new(1.0, LINE))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(Margin::symmetric(16, 14))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            add(ui)
        });
}

/// "Company   Acme" row inside a card.
fn row(ui: &mut egui::Ui, label: &str, value: &str, dot: Option<Color32>) {
    ui.horizontal(|ui| {
        ui.set_min_height(24.0);
        let (r, _) = ui.allocate_exact_size(vec2(96.0, 24.0), Sense::hover());
        ui.painter().text(r.left_center(), Align2::LEFT_CENTER, label, font(14.0), MUTED);
        if let Some(c) = dot {
            let (r, _) = ui.allocate_exact_size(vec2(8.0, 24.0), Sense::hover());
            ui.painter().circle_filled(r.center(), 4.0, c);
        }
        ui.add(egui::Label::new(egui::RichText::new(value).font(font_of("medium", 14.0)).color(TEXT)).truncate());
    });
}

/// Privacy line with a small tick (shared) or a dash (never shared).
fn promise(ui: &mut egui::Ui, shared: bool, text: &str) {
    ui.horizontal_top(|ui| {
        let (r, _) = ui.allocate_exact_size(vec2(18.0, 20.0), Sense::hover());
        let c = r.center() + vec2(0.0, 1.0);
        if shared {
            draw_icon(ui.painter(), c, 5.5, Icon::Check, GREEN, 1.8);
        } else {
            ui.painter().line_segment([c + vec2(-4.5, 0.0), c + vec2(4.5, 0.0)], Stroke::new(1.8, FAINT));
        }
        ui.add(egui::Label::new(egui::RichText::new(text).font(font(14.0)).color(TEXT).line_height(Some(20.0))).wrap());
    });
}

/// Window frame: background, border, header; returns the content area and
/// the footer area (for the buttons), both inside the side padding.
fn chrome(ui: &mut egui::Ui, footer_h: f32) -> (Rect, Rect) {
    let full = ui.max_rect();
    ui.painter().rect_filled(full, CornerRadius::ZERO, BG);
    header(ui);
    ui.painter().rect_stroke(full, CornerRadius::ZERO, Stroke::new(1.0, LINE), egui::StrokeKind::Inside);
    let inner = Rect::from_min_max(pos2(full.left() + PAD, full.top() + HEADER + 28.0), pos2(full.right() - PAD, full.bottom() - 26.0));
    let footer = Rect::from_min_max(pos2(inner.left(), inner.bottom() - footer_h), inner.max);
    let content = Rect::from_min_max(inner.min, pos2(inner.right(), footer.top() - 12.0));
    (content, footer)
}

fn in_rect<R>(ui: &mut egui::Ui, rect: Rect, add: impl FnOnce(&mut egui::Ui) -> R) -> R {
    ui.scope_builder(UiBuilder::new().max_rect(rect).layout(egui::Layout::top_down(egui::Align::Min)), add).inner
}

fn version_line(ui: &mut egui::Ui, rect: Rect) {
    ui.painter().text(pos2(rect.center().x, rect.bottom() + 12.0), Align2::CENTER_CENTER, format!("angar for desktop · version {VERSION}"), font(12.0), FAINT);
}

// ---------------------------------------------------------------- set-up flow

enum Screen {
    AlreadySetUp,
    Working(String),
    Email { input: String, error: Option<String>, focus: bool },
    Done { updated: bool },
    Failed { title: String, msg: String, detail: Option<String>, retry: bool },
}

enum Msg {
    Joined(Result<(String, String), String>),
    Installed(Result<(), String>),
}

struct Setup {
    input: SetupInput,
    screen: Screen,
    rx: Option<Receiver<Msg>>,
    updating: bool,
    started: bool,
    out: Rc<RefCell<Outcome>>,
    shown_at: Instant,
}

impl Setup {
    fn new(input: SetupInput, out: Rc<RefCell<Outcome>>) -> Self {
        Setup { input, screen: Screen::Working(String::new()), rx: None, updating: false, started: false, out, shown_at: Instant::now() }
    }

    fn company(&self) -> String {
        self.input.cfg.company.clone().unwrap_or_else(|| "your company".into())
    }

    fn start(&mut self, ctx: &egui::Context) {
        let c = &self.input.cfg;
        if !self.input.join_explicit && c.token.is_some() && c.email.is_some() {
            self.screen = Screen::AlreadySetUp;
        } else {
            self.link(ctx);
        }
    }

    fn go(&mut self, s: Screen) {
        self.screen = s;
        self.shown_at = Instant::now();
    }

    /// Step 1: link to the company (join code from the file name).
    fn link(&mut self, ctx: &egui::Context) {
        let need = self.input.cfg.token.is_none() || self.input.code.is_some() && self.input.join_explicit;
        if !need {
            self.email_step();
            if self.input.cfg.email.is_some() {
                self.finish(ctx);
            }
            return;
        }
        let Some(code) = self.input.code.clone() else {
            return self.go(Screen::Failed {
                title: "This copy isn't linked to a company".into(),
                msg: "Download angar again from your company's angar link, or ask your IT team for it.".into(),
                detail: None,
                retry: false,
            });
        };
        let (tx, rx) = channel();
        let (server, ctx) = (self.input.cfg.server.clone(), ctx.clone());
        std::thread::spawn(move || {
            let _ = tx.send(Msg::Joined(join(&server, &code)));
            ctx.request_repaint();
        });
        self.rx = Some(rx);
        self.go(Screen::Working("Connecting to your company…".into()));
    }

    /// Step 2: work email — from --email, from Windows (Entra ID), or asked.
    fn email_step(&mut self) {
        if let Some(e) = self.input.email_arg.take() {
            self.input.cfg.email = valid_email(&e);
        }
        if self.input.cfg.email.is_none() {
            self.input.cfg.email = install::os_email(self.input.email_domain.as_deref());
        }
        if self.input.cfg.email.is_none() {
            self.go(Screen::Email { input: String::new(), error: None, focus: true });
        }
    }

    /// Step 3: save, install for this user, start in the background.
    fn finish(&mut self, ctx: &egui::Context) {
        self.input.cfg.save();
        if self.input.no_install {
            return self.go(Screen::Done { updated: self.updating });
        }
        let (tx, rx) = channel();
        let ctx = ctx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(Msg::Installed(install::install_and_start()));
            ctx.request_repaint();
        });
        self.rx = Some(rx);
        self.go(Screen::Working(if self.updating { format!("Updating to version {VERSION}…") } else { "Setting up angar…".into() }));
    }

    fn poll(&mut self, ctx: &egui::Context) {
        let Some(msg) = self.rx.as_ref().and_then(|rx| rx.try_recv().ok()) else { return };
        self.rx = None;
        match msg {
            Msg::Joined(Ok((token, company))) => {
                self.input.cfg.token = Some(token);
                self.input.cfg.company = Some(company);
                self.email_step();
                if self.input.cfg.email.is_some() {
                    self.finish(ctx);
                }
            }
            Msg::Joined(Err(e)) => {
                let invalid = e.starts_with("This company link");
                self.go(Screen::Failed {
                    title: if invalid { "This link has expired".into() } else { "Couldn't connect".into() },
                    msg: if invalid {
                        "Your company's angar link was changed. Download angar again from the new link, or ask your IT team.".into()
                    } else {
                        "angar couldn't reach your company's workspace. Check the internet connection (or VPN / proxy) and try again.".into()
                    },
                    detail: (!invalid).then_some(e),
                    retry: !invalid,
                })
            }
            Msg::Installed(r) => {
                if let Err(e) = r {
                    // Keep working from this copy once the window is closed.
                    eprintln!("install failed ({e}); running in the foreground");
                    *self.out.borrow_mut() = Outcome::RunForeground(self.input.cfg.clone());
                }
                self.go(Screen::Done { updated: self.updating });
            }
        }
    }
}

impl eframe::App for Setup {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        if !self.started {
            self.started = true;
            self.start(&ctx);
        }
        self.poll(&ctx);
        // Gentle fade-in of each screen.
        let t = (self.shown_at.elapsed().as_secs_f32() / 0.18).min(1.0);
        if t < 1.0 {
            ctx.request_repaint();
        }
        ui.set_opacity(0.35 + 0.65 * t);

        let company = self.company();
        let mut action: Option<Box<dyn FnOnce(&mut Setup)>> = None;
        let footer_h = match &self.screen {
            Screen::AlreadySetUp => 100.0,
            Screen::Email { .. } => 44.0,
            Screen::Done { .. } | Screen::Failed { retry: false, .. } => 44.0,
            Screen::Failed { retry: true, .. } => 100.0,
            Screen::Working(_) => 0.0,
        };
        let (content, footer) = chrome(ui, footer_h);
        version_line(ui, footer);

        match &mut self.screen {
            Screen::AlreadySetUp => {
                let email = self.input.cfg.email.clone().unwrap_or_default();
                in_rect(ui, content, |ui| {
                    badge(ui, Icon::Update, ACCENT);
                    ui.add_space(14.0);
                    title(ui, "angar is already installed");
                    body(ui, "Update to the new version and keep your settings, or set angar up again with a different email or company.");
                    ui.add_space(14.0);
                    card(ui, |ui| {
                        row(ui, "Company", &company, None);
                        row(ui, "Email", &email, None);
                        row(ui, "New version", VERSION, None);
                    });
                });
                in_rect(ui, footer, |ui| {
                    if button(ui, &format!("Update to {VERSION}"), Kind::Primary, true) {
                        action = Some(Box::new(|s: &mut Setup| s.updating = true));
                    }
                    ui.add_space(4.0);
                    if button(ui, "Set up again", Kind::Secondary, true) {
                        action = Some(Box::new(|s: &mut Setup| {
                            s.input.cfg.token = None;
                            s.input.cfg.company = None;
                            s.input.cfg.email = None;
                            s.input.cfg.save();
                        }));
                    }
                });
            }
            Screen::Working(text) => {
                let text = text.clone();
                in_rect(ui, content, |ui| {
                    ui.add_space(content.height() * 0.28);
                    ui.vertical_centered(|ui| {
                        ui.add(egui::Spinner::new().size(34.0).color(ACCENT));
                        ui.add_space(18.0);
                        ui.label(egui::RichText::new(text).font(font_of("medium", 17.0)).color(TEXT));
                        ui.add_space(2.0);
                        ui.label(egui::RichText::new("This only takes a moment.").font(font(14.0)).color(MUTED));
                    });
                });
            }
            Screen::Email { input, error, focus } => {
                let mut submit = false;
                in_rect(ui, content, |ui| {
                    badge(ui, Icon::Logo, ACCENT);
                    ui.add_space(14.0);
                    title(ui, "Welcome to angar");
                    body(ui, &format!("{company} uses angar to see which AI tools are used at work, so nobody pays for seats they don't need."));
                    ui.add_space(14.0);
                    card(ui, |ui| {
                        promise(ui, true, "Shares only the names of AI tools and the time spent");
                        promise(ui, false, "Never the pages you visit, what you type, files or messages");
                        promise(ui, false, "Runs quietly in the background — no admin rights needed");
                    });
                    ui.add_space(20.0);
                    ui.label(egui::RichText::new("Work email").font(font_of("medium", 14.0)).color(TEXT));
                    let edit = egui::TextEdit::singleline(input)
                        .hint_text(egui::RichText::new("name@company.com").color(FAINT))
                        .font(font(15.0))
                        .margin(Margin::symmetric(12, 11))
                        .desired_width(f32::INFINITY);
                    let r = ui.add(edit);
                    if *focus {
                        r.request_focus();
                        *focus = false;
                    }
                    if r.changed() {
                        *error = None;
                    }
                    if r.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        submit = true;
                    }
                    if let Some(e) = error {
                        ui.label(egui::RichText::new(e.as_str()).font(font(13.0)).color(RED));
                    }
                });
                let ready = !input.trim().is_empty();
                in_rect(ui, footer, |ui| {
                    if button(ui, "Continue", Kind::Primary, ready) {
                        submit = true;
                    }
                });
                if submit && ready {
                    match valid_email(input) {
                        Some(v) => {
                            action = Some(Box::new(move |s: &mut Setup| s.input.cfg.email = Some(v)));
                        }
                        None => {
                            *error = Some("That doesn't look like an email address.".into());
                            *focus = true;
                        }
                    }
                }
            }
            Screen::Done { updated } => {
                let updated = *updated;
                let email = self.input.cfg.email.clone().unwrap_or_default();
                in_rect(ui, content, |ui| {
                    badge(ui, Icon::Check, GREEN);
                    ui.add_space(14.0);
                    if updated {
                        title(ui, &format!("Updated to version {VERSION}"));
                        body(ui, "Everything is kept as it was. angar keeps running quietly in the background.");
                    } else {
                        title(ui, "You're all set");
                        body(ui, &format!("angar is on and runs quietly in the background. It starts by itself when you turn on the computer — there's nothing else to do."));
                    }
                    ui.add_space(14.0);
                    card(ui, |ui| {
                        row(ui, "Company", &company, None);
                        row(ui, "Email", &email, None);
                        row(ui, "Status", "Running in the background", Some(GREEN));
                    });
                    ui.add_space(12.0);
                    ui.label(egui::RichText::new("Only AI tool names and time spent are shared — never pages, what you type, or anything else.").font(font(13.0)).color(MUTED));
                });
                in_rect(ui, footer, |ui| {
                    if button(ui, "Done", Kind::Primary, true) {
                        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            }
            Screen::Failed { title: t, msg, detail, retry } => {
                let (t, msg, detail, retry) = (t.clone(), msg.clone(), detail.clone(), *retry);
                in_rect(ui, content, |ui| {
                    badge(ui, Icon::Alert, RED);
                    ui.add_space(14.0);
                    title(ui, &t);
                    body(ui, &msg);
                    if let Some(d) = detail {
                        ui.add_space(10.0);
                        card(ui, |ui| {
                            ui.label(egui::RichText::new(d).font(FontId::monospace(11.5)).color(FAINT));
                        });
                    }
                });
                in_rect(ui, footer, |ui| {
                    if retry && button(ui, "Try again", Kind::Primary, true) {
                        action = Some(Box::new(|_s: &mut Setup| {}));
                    }
                    if retry {
                        ui.add_space(4.0);
                    }
                    if button(ui, "Close", if retry { Kind::Secondary } else { Kind::Primary }, true) {
                        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                });
            }
        }

        // Transitions (after drawing, so the borrow of the screen is over).
        if let Some(f) = action {
            f(self);
            match self.screen {
                Screen::AlreadySetUp if self.updating => self.finish(&ctx),
                Screen::AlreadySetUp => self.link(&ctx),
                Screen::Email { .. } if self.input.cfg.email.is_some() => self.finish(&ctx),
                Screen::Failed { .. } => self.link(&ctx),
                _ => {}
            }
        }
        if ui.input(|i| i.key_pressed(Key::Escape)) && !matches!(self.screen, Screen::Working(_)) {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
        }
    }
}

// ---------------------------------------------------------------- message

struct Message {
    title: String,
    body: String,
    tone: Tone,
}

impl eframe::App for Message {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let (content, footer) = chrome(ui, 44.0);
        let (icon, color) = match self.tone {
            Tone::Info => (Icon::Info, ACCENT),
            Tone::Success => (Icon::Check, GREEN),
            Tone::Warning => (Icon::Alert, ACCENT),
        };
        in_rect(ui, content, |ui| {
            badge(ui, icon, color);
            ui.add_space(14.0);
            title(ui, &self.title);
            body(ui, &self.body);
        });
        in_rect(ui, footer, |ui| {
            if button(ui, "Got it", Kind::Primary, true) {
                ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
            }
        });
        if ui.input(|i| i.key_pressed(Key::Escape) || i.key_pressed(Key::Enter)) {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
        }
    }
}
