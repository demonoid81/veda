import std.conv;
import vibe.d;
import veda.storage;
import onto.owl;
import onto.individual;


void showError(HTTPServerRequest req, HTTPServerResponse res, HTTPServerErrorInfo error)
{
	//res.render!("error.dt", req, error);
	res.renderCompat!("error.dt",
		HTTPServerRequest, "req",
		HTTPServerErrorInfo, "error")(req, error);
}

void getClasses(HTTPServerRequest req, HTTPServerResponse res)
{
	immutable (Class)[string] classes = get_all_classes();
	string[][string] subclasses;
	string[][string] superclasses;
	foreach(_class; classes.values) {
		auto superClasses = _class.subClassOf;
		foreach(superClass; superClasses) {
			superclasses[_class.uri] ~= superClass.uri;
			subclasses[superClass.uri] ~= _class.uri;
		}
	}
	logInfo("sublasses: " ~ text(subclasses) ~ "\n");
	logInfo("superclasses: " ~ text(superclasses) ~ "\n");
	res.renderCompat!("classes.dt",
		HTTPServerRequest, "req",
		immutable (Class)[string], "classes")(req, classes);
}

void getIndividual(HTTPServerRequest req, HTTPServerResponse res)
{
	Individual individual = get_individual("mondi-data:SemanticMachines");
	res.renderCompat!("individual.dt",
		HTTPServerRequest, "req",
		Individual, "individual")(req, individual);
}

shared static this()
{
	// initialize storage I
	auto vs = new VedaStorage ();
	auto settings = new HTTPServerSettings;
	settings.port = 8080;
//	settings.bindAddresses = ["::1", "127.0.0.1", "172.17.35.148"];
	settings.errorPageHandler = toDelegate(&showError);

	auto router = new URLRouter;
	router.get("/", staticTemplate!"index.dt");
	router.get("/classes", &getClasses);
	router.get("/individual", &getIndividual);
	router.get("*", serveStaticFiles("public"));

	listenHTTP(settings, router);
	logInfo("Please open http://127.0.0.1:8080/ in your browser.");

	// initialize storage II
	vs.init();
}