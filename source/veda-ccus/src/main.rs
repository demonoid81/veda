#[macro_use]
extern crate log;

use std::time::{Duration, Instant};
use actix::prelude::*;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer};
use actix_web_actors::ws;

use ini::Ini;

const HEARTBEAT_INTERVAL: Duration = Duration::from_millis(5000);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

mod server;

/////////////////////////////////////////////

fn ccus_route(req: HttpRequest, stream: web::Payload, srv: web::Data<Addr<server::CCUSServer>>) -> Result<HttpResponse, Error> {
    ws::start(
        WsCCUSSession {
            id: 0,
            hb: Instant::now(),
            addr: srv.get_ref().clone(),
        },
        &req,
        stream,
    )
}

struct WsCCUSSession {
    /// unique session id
    id: usize,
    /// Client must send ping at least once per 10 seconds (CLIENT_TIMEOUT),
    /// otherwise we drop connection.
    hb: Instant,
    /// CCUS server
    addr: Addr<server::CCUSServer>,
}

impl Actor for WsCCUSSession {
    type Context = ws::WebsocketContext<Self>;

    /// Method is called on actor start.
    /// We register ws session with CCUSServer
    fn started(&mut self, ctx: &mut Self::Context) {
        // we'll start heartbeat process on session start.
        self.hb(ctx);

        // register self in ccus server. `AsyncContext::wait` register
        // future within context, but context waits until this future resolves
        // before processing any other events.
        // HttpContext::state() is instance of WsCCUSSessionState, state is shared
        // across all routes within application
        let addr = ctx.address();
        self.addr
            .send(server::Connect {
                addr: addr.recipient(),
            })
            .into_actor(self)
            .then(|res, act, ctx| {
                match res {
                    Ok(res) => act.id = res,
                    // something is wrong with ccus server
                    _ => ctx.stop(),
                }
                fut::ok(())
            })
            .wait(ctx);
    }

    fn stopping(&mut self, _: &mut Self::Context) -> Running {
        // notify ccus server
        self.addr.do_send(server::Disconnect {
            id: self.id,
        });
        Running::Stop
    }
}

/// Handle messages from ccus server, we simply send it to peer websocket
impl Handler<server::Message> for WsCCUSSession {
    type Result = ();

    fn handle(&mut self, msg: server::Message, ctx: &mut Self::Context) {
        ctx.text(msg.0);
    }
}

/// WebSocket message handler
impl StreamHandler<ws::Message, ws::ProtocolError> for WsCCUSSession {
    fn handle(&mut self, msg: ws::Message, ctx: &mut Self::Context) {
        debug!("WEBSOCKET MESSAGE: {:?}", msg);
        match msg {
            ws::Message::Ping(msg) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            ws::Message::Pong(_) => {
                self.hb = Instant::now();
            }
            ws::Message::Text(text) => {
                let m = text.trim();

                self.addr.do_send(server::ClientMessage {
                    id: self.id,
                    msg: m.to_owned(),
                });
            }
            ws::Message::Binary(_) => println!("Unexpected binary"),
            ws::Message::Close(_) => {
                ctx.stop();
            }
            ws::Message::Nop => (),
        }
    }
}

impl WsCCUSSession {
    /// helper method that sends ping to client every second.
    ///
    /// also this method checks heartbeats from client
    fn hb(&self, ctx: &mut ws::WebsocketContext<Self>) {
        ctx.run_interval(HEARTBEAT_INTERVAL, |act, ctx| {
            // check client heartbeats
            if Instant::now().duration_since(act.hb) > CLIENT_TIMEOUT {
                // heartbeat timed out
                info!("Websocket Client heartbeat failed, disconnecting!");

                // notify ccus server
                act.addr.do_send(server::Disconnect {
                    id: act.id,
                });

                // stop actor
                ctx.stop();

                // don't try to send a ping
                return;
            }

            ctx.ping("");
        });
    }
}

fn main() -> std::io::Result<()> {
    std::env::set_var("RUST_LOG", "info,actix_server=info,actix_web=info");
    env_logger::init();

    let conf = Ini::load_from_file("veda.properties").expect("fail load veda.properties file");

    let section = conf.section(None::<String>).expect("fail parse veda.properties");
    let ccus_port = section.get("ccus_port").expect("param [ccus_port] not found in veda.properties").clone();

    let ro_client_addr: String;

    if let Some(p) = section.get("ro_storage_url") {
        ro_client_addr = p.to_string();
    } else {
        ro_client_addr = "".to_string();
        warn!("param [ro_storage_url] not found in veda.properties")
    }

    info!("CCUS PORT={:?}, RO-CLIENT={:?}", ccus_port, ro_client_addr);

    let sys = System::new("ws-example");

    // Start ccus server actor
    let server = server::CCUSServer::default().start();

    // Create Http server with websocket support
    HttpServer::new(move || {
        App::new()
            .data(server.clone())
            // websocket
            .service(web::resource("/ccus").to(ccus_route))
    })
    .bind("[::]:".to_owned() + &ccus_port)?
    .start();

    sys.run()
}
