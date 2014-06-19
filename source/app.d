import std.conv;
import vibe.d;
import veda.pacahon_driver;
import veda.storage_rest;

void view_error(HTTPServerRequest req, HTTPServerResponse res, HTTPServerErrorInfo error) {
	res.renderCompat!("view_error.dt",
		HTTPServerRequest, "req",
		HTTPServerErrorInfo, "error")(req, error);
}

shared static this()
{
	// initialize storage
	auto pacahon = new PacahonDriver ();
	pacahon.init(); 

	auto settings = new HTTPServerSettings;
	settings.port = 8080; 
	//settings.bindAddresses = ["::1", "127.0.0.1", "172.17.35.148"];
	//settings.bindAddresses = ["127.0.0.1"];
	settings.errorPageHandler = toDelegate(&view_error);

	auto router = new URLRouter;
	router.get("*", serveStaticFiles("public"));
	router.get("/", serveStaticFile("public/index.html"));
	router.get("/tests", serveStaticFile("public/tests.html"));
	registerRestInterface(router, new VedaStorageRest());

	logInfo("============ROUTES=============");
	auto routes = router.getAllRoutes();
	logInfo("GET:");
	foreach(key, value; routes[HTTPMethod.GET]) {
		logInfo(text(key) ~ ": " ~ value.pattern);
	}
	logInfo("PUT:");
	foreach(key, value; routes[HTTPMethod.PUT]) {
		logInfo(text(key) ~ ": " ~ value.pattern);
	}
	logInfo("POST:");
	foreach(key, value; routes[HTTPMethod.POST]) {
		logInfo(text(key) ~ ": " ~ value.pattern);
	}
	logInfo("DELETE:");
	foreach(key, value; routes[HTTPMethod.DELETE]) {
		logInfo(text(key) ~ ": " ~ value.pattern);
	}
	logInfo("===============================");

	listenHTTP(settings, router);
	logInfo("Please open http://127.0.0.1:8080/ in your browser.");
	
}