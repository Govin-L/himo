#include <node_api.h>
#include <cmath>
#import <AppKit/AppKit.h>

// The web page remains the sole owner of input and playback/navigation state.
@interface HimoControlGlassView : NSGlassEffectView
@end
@implementation HimoControlGlassView
- (NSView *)hitTest:(NSPoint)point { return nil; }
@end

struct Controls {
  __weak NSView *root;
  __strong HimoControlGlassView *player;
  __strong HimoControlGlassView *tabs;
  __strong HimoControlGlassView *search;
  bool disposed = false;
};

static napi_value Error(napi_env env, const char *message) {
  napi_throw_error(env, nullptr, message);
  return nullptr;
}

static void Detach(Controls *controls) {
  for (HimoControlGlassView *view in @[controls->player, controls->tabs, controls->search]) {
    view.hidden = YES;
    [view removeFromSuperview];
  }
  controls->disposed = true;
}

static void Finalize(napi_env env, void *data, void *hint) {
  auto *controls = static_cast<Controls *>(data);
  if ([NSThread isMainThread]) Detach(controls);
  else {
    NSArray<NSView *> *views = @[controls->player, controls->tabs, controls->search];
    dispatch_async(dispatch_get_main_queue(), ^{
      for (NSView *view in views) [view removeFromSuperview];
    });
  }
  delete controls;
}

static Controls *GetControls(napi_env env, napi_value value) {
  void *data = nullptr;
  if (![NSThread isMainThread] || napi_get_value_external(env, value, &data) != napi_ok || !data) {
    Error(env, "Native control glass requires its own controller on the main thread");
    return nullptr;
  }
  return static_cast<Controls *>(data);
}

static napi_value Create(napi_env env, napi_callback_info info) {
  size_t count = 1, length = 0;
  napi_value args[1];
  void *buffer = nullptr;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (![NSThread isMainThread] || count != 1 ||
      napi_get_buffer_info(env, args[0], &buffer, &length) != napi_ok || length != sizeof(void *)) {
    return Error(env, "Expected the owner BrowserWindow native handle on the main thread");
  }
  NSView *root = (__bridge NSView *)(*static_cast<void **>(buffer));
  if (!root || !root.window) return Error(env, "The owner native view is unavailable");
  auto *controls = new Controls();
  controls->root = root;
  // Chromium's compositor precedes its WebContentsView wrapper in the native tree.
  NSView *page = nil;
  for (NSView *view in root.subviews) {
    if (![view isKindOfClass:[NSGlassEffectView class]]) { page = view; break; }
  }
  controls->player = [[HimoControlGlassView alloc] initWithFrame:NSZeroRect];
  controls->tabs = [[HimoControlGlassView alloc] initWithFrame:NSZeroRect];
  controls->search = [[HimoControlGlassView alloc] initWithFrame:NSZeroRect];
  for (HimoControlGlassView *view in @[controls->player, controls->tabs, controls->search]) {
    view.hidden = YES;
    view.style = NSGlassEffectViewStyleClear;
    view.tintColor = [NSColor colorWithSRGBRed:0.13 green:0.13 blue:0.16 alpha:0.16];
    if (@available(macOS 27.0, *)) view.effectIsInteractive = YES;
    // Above the whole-window glass, below Chromium; never cover the HTML buttons.
    [root addSubview:view positioned:NSWindowBelow relativeTo:page];
  }
  controls->player.identifier = @"himo-player-glass";
  controls->tabs.identifier = @"himo-tabs-glass";
  controls->search.identifier = @"himo-search-glass";
  napi_value result;
  napi_create_external(env, controls, Finalize, nullptr, &result);
  return result;
}

static bool ReadRect(napi_env env, napi_value layout, const char *key, NSRect *rect, bool *hidden) {
  napi_value value;
  napi_valuetype type;
  if (napi_get_named_property(env, layout, key, &value) != napi_ok ||
      napi_typeof(env, value, &type) != napi_ok) return false;
  *hidden = type == napi_null;
  if (*hidden) return true;
  if (type != napi_object) return false;
  double fields[4];
  const char *keys[] = {"x", "y", "width", "height"};
  for (int index = 0; index < 4; ++index) {
    napi_value field;
    if (napi_get_named_property(env, value, keys[index], &field) != napi_ok ||
        napi_get_value_double(env, field, &fields[index]) != napi_ok || !std::isfinite(fields[index])) return false;
  }
  if (fields[0] < 0 || fields[1] < 0 || fields[2] <= 0 || fields[3] <= 0) return false;
  *rect = NSMakeRect(fields[0], fields[1], fields[2], fields[3]);
  return true;
}

static void SetRect(NSView *root, HimoControlGlassView *view, NSRect rect, bool hidden) {
  if (!hidden) {
    rect.origin.x += root.bounds.origin.x;
    rect.origin.y = root.bounds.origin.y + (root.isFlipped ? rect.origin.y
      : root.bounds.size.height - rect.origin.y - rect.size.height);
    view.frame = rect;
    view.cornerRadius = MIN(rect.size.width, rect.size.height) / 2;
  }
  view.hidden = hidden;
}

static napi_value Update(napi_env env, napi_callback_info info) {
  size_t count = 2;
  napi_value args[2];
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 2) return Error(env, "Expected a controller and the control rectangles");
  Controls *controls = GetControls(env, args[0]);
  if (!controls) return nullptr;
  NSView *root = controls->root;
  NSRect player = NSZeroRect, tabs = NSZeroRect, search = NSZeroRect;
  bool playerHidden = true, tabsHidden = true, searchHidden = true;
  if (!ReadRect(env, args[1], "player", &player, &playerHidden) ||
      !ReadRect(env, args[1], "tabs", &tabs, &tabsHidden) ||
      !ReadRect(env, args[1], "search", &search, &searchHidden)) return Error(env, "Invalid control rectangles");
  bool active = !controls->disposed && root != nil;
  if (active) {
    SetRect(root, controls->player, player, playerHidden);
    SetRect(root, controls->tabs, tabs, tabsHidden);
    SetRect(root, controls->search, search, searchHidden);
  }
  napi_value result;
  napi_get_boolean(env, active, &result);
  return result;
}

static napi_value DescribeView(napi_env env, NSView *root, HimoControlGlassView *view) {
  napi_value object, value;
  napi_create_object(env, &object);
  NSRect rect = view.frame;
  if (!root.isFlipped) rect.origin.y = root.bounds.size.height - rect.origin.y - rect.size.height;
  const char *keys[] = {"x", "y", "width", "height", "cornerRadius"};
  double fields[] = {rect.origin.x, rect.origin.y, rect.size.width, rect.size.height, view.cornerRadius};
  for (int index = 0; index < 5; ++index) {
    napi_create_double(env, fields[index], &value);
    napi_set_named_property(env, object, keys[index], value);
  }
  napi_get_boolean(env, view.hidden, &value);
  napi_set_named_property(env, object, "hidden", value);
  napi_get_boolean(env, root && view.superview == root, &value);
  napi_set_named_property(env, object, "attached", value);
  napi_get_boolean(env, [view isKindOfClass:[NSGlassEffectView class]], &value);
  napi_set_named_property(env, object, "nativeGlass", value);
  napi_get_boolean(env, [view hitTest:NSZeroPoint] == nil, &value);
  napi_set_named_property(env, object, "passesMouseEvents", value);
  return object;
}

// Main-process diagnostics also let checks compare Cocoa frames to real DOM geometry.
static napi_value Describe(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1], result, value;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1) return Error(env, "Expected a native control glass controller");
  Controls *controls = GetControls(env, args[0]);
  if (!controls) return nullptr;
  NSView *root = controls->root;
  napi_create_object(env, &result);
  napi_set_named_property(env, result, "player", DescribeView(env, root, controls->player));
  napi_set_named_property(env, result, "tabs", DescribeView(env, root, controls->tabs));
  napi_set_named_property(env, result, "search", DescribeView(env, root, controls->search));
  unsigned int views = 0;
  for (NSView *view in root.subviews) if ([view isKindOfClass:[HimoControlGlassView class]]) ++views;
  napi_create_uint32(env, views, &value);
  napi_set_named_property(env, result, "viewCount", value);
  NSUInteger contentIndex = root.subviews.count;
  for (NSView *view in root.subviews) {
    if (![view isKindOfClass:[NSGlassEffectView class]]) {
      contentIndex = [root.subviews indexOfObject:view];
      break;
    }
  }
  napi_get_boolean(env, [root.subviews indexOfObject:controls->player] < contentIndex &&
    [root.subviews indexOfObject:controls->tabs] < contentIndex &&
    [root.subviews indexOfObject:controls->search] < contentIndex, &value);
  napi_set_named_property(env, result, "belowWebContent", value);
  return result;
}

static napi_value Destroy(napi_env env, napi_callback_info info) {
  size_t count = 1;
  napi_value args[1], result;
  napi_get_cb_info(env, info, &count, args, nullptr, nullptr);
  if (count != 1) return Error(env, "Expected a native control glass controller");
  Controls *controls = GetControls(env, args[0]);
  if (!controls) return nullptr;
  Detach(controls);
  napi_get_undefined(env, &result);
  return result;
}

static napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
    {"create", nullptr, Create, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"update", nullptr, Update, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"describe", nullptr, Describe, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"destroy", nullptr, Destroy, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 4, properties);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
