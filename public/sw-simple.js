// This is the "Simple offline" service worker

var version = 6;
var FILES = "files" + version;
var STATIC = "static" + version;
var API = [
  "/ping",
  "/get_rights",
  "/get_rights_origin",
  "/get_membership",
  "/authenticate",
  "/get_ticket_trusted",
  "/is_ticket_valid",
  "/get_operation_state",
  "/wait_module",
  "/query",
  "/get_individual",
  "/get_individuals",
  "/remove_individual",
  "/put_individual",
  "/add_to_individual",
  "/set_in_individual",
  "/remove_from_individual",
  "/put_individuals"
];

this.addEventListener("activate", function(event) {
  var cacheWhitelist = [ FILES, STATIC ];
  event.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (cacheWhitelist.indexOf(key) === -1) {
          return caches.delete(key);
        }
      }));
    })
  );
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  var pathname = url.pathname;
  var isAPI = API.indexOf(pathname) >= 0;
  var isFILES = pathname.indexOf("/files") === 0;
  var isSTATIC = !isAPI && !isFILES;
  if (event.request.method === "GET") {
    if (isSTATIC) {
      event.respondWith(handleFetch(event, STATIC));
    } else if (isFILES) {
      event.respondWith(handleFetch(event, FILES));
    }
  }
});

function handleFetch(event, CACHE) {
  return caches.match(event.request).then(function(resp) {
    return resp || fetch(event.request).then(function(response) {
      return caches.open( CACHE ).then(function(cache) {
        cache.put(event.request, response.clone());
        return response;
      });
    });
  });
}
