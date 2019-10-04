package main

import (
  "encoding/json"
  "fmt"
  "log"
  "os"
  "runtime"
  "strings"
  "sync"
  "time"

  "github.com/op/go-nanomsg"
  "github.com/itiu/fasthttp"
)

//ResultCode is type for representation of http codes
type ResultCode uint32

const (
    zero                    ResultCode = 0
    Ok                      ResultCode = 200
    Created                 ResultCode = 201
    NoContent               ResultCode = 204
    BadRequest              ResultCode = 400
    Forbidden               ResultCode =  403
    NotFound                ResultCode =  404
    UnprocessableEntity     ResultCode =  422
    TooManyRequests         ResultCode =  429
    SecretExpired           ResultCode =  464
    EmptyPassword           ResultCode =  465
    NewPasswordIsEqualToOld ResultCode =  466
    InvalidPassword         ResultCode =  467
    InvalidSecret           ResultCode =  468
    PasswordExpired         ResultCode =  469
    TicketNotFound          ResultCode =  470
    TicketExpired           ResultCode =  471
    NotAuthorized           ResultCode =  472
    AuthenticationFailed    ResultCode =  473
    NotReady                ResultCode =  474
    FailOpenTransaction     ResultCode =  475
    FailCommit              ResultCode =  476
    FailStore               ResultCode =  477
    InternalServerError     ResultCode =  500
    NotImplemented          ResultCode =  501
    ServiceUnavailable      ResultCode =  503
    InvalidIdentifier       ResultCode =  904
    DatabaseModifiedError   ResultCode =  999
    DiskFull                ResultCode =  1021
    DuplicateKey            ResultCode =  1022
    SizeTooLarge            ResultCode =  1118
    ConnectError            ResultCode =  4000
)

type ticket struct {
  Id        string
  UserURI   string
  UserLogin string
  result    ResultCode
  StartTime int64
  EndTime   int64
}

const (
  tdbPath = "./data/trails/ "
)

//ticketCache is map to cache requested earlier tickets
var ticketCache map[string]ticket
var ticketCacheMutex = sync.RWMutex{}

//ontologyCache is map to cache requested earlier individuals from ontology
var ontologyCache map[string]Individual

//mifCache is map to cache opened ModuleInfoFile structs
var mifCache map[int]*ModuleInfoFile

//conn is Connector to trarantool database
var conn Connector

//socket is nanomsg socket connected to server
var g_mstorage_ch *nanomsg.Socket

var mstorage_ch_Mutex = sync.RWMutex{}

//mainModuleURL is tcp address of veda server
var mainModuleURL = ""
var notifyChannelURL = ""
var queryServiceURL = ""
var roStorageURL = ""
var tarantoolURL = ""
var webserverPort = ""
var webserverHTTPSPort = ""

//var aclServiceURL = ""
var useHTTPS = false

//attachmentsPath is path where files from request are stored
var attachmentsPath = "./data/files/"

//areExternalUsers is variable to activate ExternalUsers features
var areExternalUsers = false

var isTrail = true

//countTrails is variable to count trail requests, after limit they are flushed
var countTrails = 0

//codeToJsonException converts ResultCode value to its string representation
func codeToJsonException(code ResultCode) []byte {
  exception := make(map[string]interface{})

  switch code {
case zero:
    exception["statusMessage"] = "zero"

    /// 200
case Ok:
    exception["statusMessage"] = "Ok"

    /// 201
case Created:
    exception["statusMessage"] = "Created"

    /// 204
case NoContent:
    exception["statusMessage"] = "NoContent"

    /// 400
case BadRequest:
    exception["statusMessage"] = "Bad_Request"

    /// 403
case Forbidden:
    exception["statusMessage"] = "Forbidden"

    /// 404
case NotFound:
    exception["statusMessage"] = "NotFound"

    /// 422
case UnprocessableEntity:
    exception["statusMessage"] = "UnprocessableEntity"

    /// 429
case TooManyRequests:
    exception["statusMessage"] = "TooManyRequests"

    /// 464
case SecretExpired:
    exception["statusMessage"] = "SecretExpired"

    /// 465
case EmptyPassword:
    exception["statusMessage"] = "EmptyPassword"

    /// 466
case NewPasswordIsEqualToOld:
    exception["statusMessage"] = "NewPasswordIsEqualToOld"

    /// 467
case InvalidPassword:
    exception["statusMessage"] = "InvalidPassword"

    /// 468
case InvalidSecret:
    exception["statusMessage"] = "InvalidSecret"

    /// 469
case PasswordExpired:
    exception["statusMessage"] = "PasswordExpired"

    /// 470
case TicketNotFound:
    exception["statusMessage"] = "TicketNotFound"

    /// 471
case TicketExpired:
    exception["statusMessage"] = "TicketExpired"

    /// 472
case NotAuthorized:
    exception["statusMessage"] = "NotAuthorized"

    /// 473
case AuthenticationFailed:
    exception["statusMessage"] = "AuthenticationFailed"

    /// 474
case NotReady:
    exception["statusMessage"] = "NotReady"

    /// 475
case FailOpenTransaction:
    exception["statusMessage"] = "FailOpenTransaction"

    /// 476
case FailCommit:
    exception["statusMessage"] = "FailCommit"

    /// 477
case FailStore:
    exception["statusMessage"] = "FailStore"

    /// 500
case InternalServerError:
    exception["statusMessage"] = "InternalServerError"

    /// 501
case NotImplemented:
    exception["statusMessage"] = "NotImplemented"

    /// 503
case ServiceUnavailable:
    exception["statusMessage"] = "ServiceUnavailable"

case InvalidIdentifier:
    exception["statusMessage"] = "InvalidIdentifier"

    /// 999
case DatabaseModifiedError:
    exception["statusMessage"] = "DatabaseModifiedError"

    /// 1021
case DiskFull:
    exception["statusMessage"] = "DiskFull"

    /// 1022
case DuplicateKey:
    exception["statusMessage"] = "DuplicateKey"

    /// 1118
case SizeTooLarge:
    exception["statusMessage"] = "SizeTooLarge"

    /// 4000
case ConnectError:
    exception["statusMessage"] = "ConnectError"

  default:
    exception["statusMessage"] = "UnknownError"
  }

  exceptionJSON, _ := json.Marshal(exception)
  return exceptionJSON
}

func getGOMAXPROCS() int {
  return runtime.GOMAXPROCS(0)
}

func main() {
  fmt.Printf("ENV GOMAXPROCS is %d\n", getGOMAXPROCS())
  runtime.GOMAXPROCS(1)
  fmt.Printf("USE GOMAXPROCS is %d\n", getGOMAXPROCS())

  log.SetFlags(log.LstdFlags | log.Lmicroseconds)

  var err error

  configWebServer()

  args := os.Args[1:]

  opt_external_users_http_port := ""

  for _, arg := range args {
    cuts := strings.Split(arg, "=")
    if len(cuts) == 2 {
      name := cuts[0]
      val := cuts[1]

      if name == "--http_port" {
        webserverPort = val
        fmt.Println("use command line param http_port=", webserverPort)
      } else if name == "--ext_usr_http_port" {
        opt_external_users_http_port = val
      }
    }
  }

  if opt_external_users_http_port != "" && opt_external_users_http_port == webserverPort {
    fmt.Println("use external user mode")
    areExternalUsers = true
  }

  g_mstorage_ch, err = nanomsg.NewSocket(nanomsg.AF_SP, nanomsg.REQ)
  if err != nil {
    log.Fatal("ERR! ON CREATING SOCKET")
  }

  _, err = g_mstorage_ch.Connect(mainModuleURL)
  for err != nil {
    _, err = g_mstorage_ch.Connect(mainModuleURL)
    time.Sleep(3000 * time.Millisecond)
  }

  conn.Connect(tarantoolURL)

  ticketCache = make(map[string]ticket)
  ontologyCache = make(map[string]Individual)
  mifCache = make(map[int]*ModuleInfoFile)

  // File server
  fs := &fasthttp.FS {
    Root:                 "public/",
    IndexNames:           []string{"index.html"},
    Compress:             true,
  }
  fsHandler := fs.NewRequestHandler()

  // Request handler
  requestHandler := func (ctx *fasthttp.RequestCtx) {
    ctx.Response.Header.Set("server", "nginx/1.8.1")
    ctx.Response.Header.SetCanonical([]byte("server"), []byte("nginx/1.8.1"))
    ctx.Response.Header.Set("X-XSS-Protection", "1; mode=block")
    ctx.Response.Header.Set("X-Content-Type-Options", "nosniff")
    ctx.Response.Header.Set("X-Frame-Options", "sameorigin")

    routeParts := strings.Split(string(ctx.Path()[:]), "/")
    if len(routeParts) >= 2 && routeParts[1] == "files" {
      files(ctx, routeParts)
      return
    }

    switch string(ctx.Path()[:]) {
      case "/api/get_individual":
        getIndividual(ctx)
      case "/api/get_individuals":
        getIndividuals(ctx)
      case "/api/put_individual":
        putIndividual(ctx)
      case "/api/put_individuals":
        putIndividuals(ctx)
      case "/api/remove_individual":
        removeIndividual(ctx)
      case "/api/remove_from_individual":
        removeFromIndividual(ctx)
      case "/api/set_in_individual":
        setInIndividual(ctx)
      case "/api/add_to_individual":
        addToIndividual(ctx)
      case "/api/authenticate":
        authenticate(ctx)
      case "/api/get_rights":
        getRights(ctx)
      case "/api/get_rights_origin":
        getAclData(ctx, GetRightsOrigin)
      case "/api/get_membership":
        getAclData(ctx, GetMembership)
      case "/api/get_ticket_trusted":
        getTicketTrusted(ctx)
      case "/api/is_ticket_valid":
        isTicketValid(ctx)
      case "/api/query":
        query(ctx)
      case "/api/send_to_module":
        sendToModule(ctx)
      case "/api/get_operation_state":
        getOperationState(ctx)
      case "/tests":
        ctx.SendFile("public/tests.html")
      case "/ontology.json":
        ctx.Response.Header.Set("Cache-Control", "max-age=43200, no-cache, must-revalidate, private")
        ctx.SendFile("public/ontology.json")
      default:
        fsHandler(ctx)
    }
  }

  // Server instance
  server := fasthttp.Server {
    Handler:              requestHandler,
    MaxRequestBodySize:   10 * 1024 * 1024 * 1024,
    ReadTimeout:          600 * time.Second,
    WriteTimeout:         600 * time.Second,
    MaxKeepaliveDuration: 600 * time.Second,
    ReadBufferSize:       8 * 1024,
  }

  go func() {
    err = server.ListenAndServe("0.0.0.0:" + webserverPort)
    if err != nil {
      log.Fatal("ERR! ON STARTUP HTTP WEBSERVER ", err)
    }
  }()

  fmt.Println("web server ready, listen " + webserverPort)
  select {}
}
