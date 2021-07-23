/**Based on https://codelabs.developers.google.com/codelabs/web-serial#0**/

'use strict';

// Variables to manage the WEB SERIAL 
let port;
let reader;
let readableStreamClosed; //inputDone;
let inputStream;
let writer;
let writableStreamClosed; //outputDone;
let outputStream;
const VENDOR_ID = 0x0694; // LEGO SPIKE Prime Hub

var sensorReads=new Array();
var NumSamples=0;
let flag=false;
let endsend=false;
let doneTX=false;

// Variables to manage the data
var dataToSend= new Array();
var dataset = new Array();
var programData, programPython;
var DataSensor=0;
var temps_ms=0;
var index=0;

// Variables to manage the server in colab

let url_server;
var txt = '';

// Variables to manage the SPIKE PRIME Terminal

const CONTROL_C = '\x03'; // CTRL-C character (ETX character)
const CONTROL_D = '\x04'; // CTRL-D character (EOT character)
const RETURN = '\x0D';    // RETURN key (enter, new line)
const PASTE_MODE = '\x05';


const butConnect = document.getElementById('butConnect');

/**
 * @name connect
 * Opens a Web Serial connection to Spike Prime and sets up the input and
 * output stream and STOPS REPL
 */
async function connectSerial() {

  // - Request a port and open a connection. Opens a pop-up on the browser to select the USB port
try {

            // Prompt user to select any serial port.
            port = await navigator.serial.requestPort();
            await port.open({ baudRate: 115200});
            console.log(port);
            readLoop();
            toggleUIConnected(true);
            setup_writer();

            writeToStream(CONTROL_C);
            
      
        } catch {
            alert("Serial Connection Failed");
        }
}

// Creates the pipe to write on the USB

function setup_writer() {
                // if writer not yet defined:
        if (typeof writer === 'undefined') {
                    // set up writer for the first time
            const encoder = new TextEncoderStream();
            writableStreamClosed = encoder.readable.pipeTo(port.writable);
            outputStream = encoder.writable;
            writer = outputStream.getWriter();
            
        }
}

//Clears the sensorReads array when a datalog is finished to prepare it for the next datalog

function clearArray() {
  while(sensorReads.length>0){
    sensorReads.pop();
 }
  return sensorReads;
}


async function sendDatalog() {
      if(flag){
        sensorReads.length = 0;
        NumSamples=0;
        DataSensor=0;
        setup_writer();
        var sensorPort=document.getElementById("sensor_port");
        var item = sensorPort.selectedIndex;
        sensorPort=sensorPort.options[item].text;
        var sampleToSend = document.getElementById("PointsToSend").value;
        NumSamples=sampleToSend;
        var tempsToSend = document.getElementById("FreqToSend").value;
        temps_ms=(1/tempsToSend)*1000;
        var temps=1/tempsToSend;

        url_server=document.getElementById("UrlToSend").value; //stores the "ngrok.io" server @ of colab

        if((sampleToSend!='')&&(tempsToSend!='')){ //if these parameters are not empty on the HTML
                                                  // sends the python program as a string to read data from the sensor selected in the HTML

          var programData='import hub, utime, json\x0Ddataset={}\x0D\x0Dfor counter in range('+sampleToSend+'):\x0D\x09if counter == 0:\x0Dreference=utime.ticks_ms()\x0Ddataset["Timestamp"]= 0\x0D\x08\x0D\x09else:\x0Ddataset["Timestamp"]= (utime.ticks_ms()-reference)\x0D\x08\x0D\x09dataset["Sensor_data"]=hub.port.'+sensorPort+'.device.get()[0]\x0D\x09print("Data %d: " %(counter))\x0D\x09print(json.dumps(dataset))\x0D\x09utime.sleep('+temps+')\x0D\x0D\x0D';
          writer = outputStream.getWriter();
          writer.write(programData);
          writer.write(CONTROL_D);
          
          writer.releaseLock();
        }
        else{alert("Please insert a number of points and Hz");}
      }
      else{ alert("Please click 'Connect' for doing a datalog");}

}
/**
 * @name disconnect
 * Closes the Web Serial connection. ** THIS FUNCTION DOESN'T WORK **
 */
async function disconnect() {
  
if (reader) {
  await reader.cancel();
  await readableStreamClosed.catch(() => {});
  reader = null;
  readableStreamClosed = null;
}

if (outputStream) {
  await outputStream.getWriter().close();
  await writableStreamClosed;
  outputStream = null;
  writableStreamClosed = null;
}

await port.close();
port = null;
toggleUIConnected(false);
return;
}


/**
 * @name clickConnect
 * Click handler for the connect/disconnect button.
 */
async function clickConnect() {
  
    if (port) {
        await disconnect();
        toggleUIConnected(false);
        return;
    }
    else{
        await connect();
        toggleUIConnected(true);
 
    }
}
/**
 * @name sendToColab
 * Send the samples to COlab to the flask route "/data". If the samples are captured with a frquency less than 5sec
 * we repeat the send function each 6sec. Otherwise, we mantain the frequency to send data to colab like the frequency 
 * the data is captured from Spike Prime
 */

function sendToColab(index, time) {
                             
    var sample = sensorReads[index]; // we take the data to send
    
    var jqxhr = $.ajax({
        url: url_server+'/data', //Flask server route to send the data
        method: "POST", //jsonp is used to avoid CROSS-origin problems. 
                        //It only works with GET, but we put Post because if not we lost data (I have to investigate that more)
        async: false,
        cache: false,
        crossDomain: true,
        dataType: "jsonp",
        data: sample,
                  
        success: function(data) {
        },
        complete:function(){
        }
            
    });
    index=index+1;

    if(index==NumSamples){ //if it is the last sample we send a value of "TRUE" 
                            //to indicate COlab that we finished to send values
         
         endsend=true;
         appendToTerminal('***Finish Uplading to Colab***');
         appendToTerminal('\n');
         if(NumSamples>1){
            clearTimeout(timerId);
          }

          var end_send={
            Timestamp: -1,
            Sensor_data: ""
          }
        var endxhr = $.ajax({
        url: url_server+'/data', //flask route in colab to send the data
        method: "POST",  //jsonp is used to avoid CROSS-origin problems. 
                        //It only works with GET, but we put Post because if not we lost data (I have to investigate that more)
        async: false,
        cache: false,
        dataType: "jsonp",
        data: end_send,
        success: function(data) {
        },
        complete:function(){
        }
            
    });

    }
    else{
          if (time==6000){
              var timerId = setTimeout(sendToColab,6000, index,time);
          }
          else{
            var timerId =  setTimeout(sendToColab,time, index,time);
          }
        
    }
}

function iterate(value) {

  value=value.replace(/"/g, ''); // replace the " by white spaces
  value=value.replace(/'/g, '"'); // replace the ' by " for the numbers to be interpreted by the Spike Prime

  writer.write(value);
  writer.write(RETURN);
  console.log("VALUE: ", value);
}
/**
Ask for retrieve a file from Google Colab
*/

async function retrievefile(){
 var server=document.getElementById("UrlToSend").value;
 var filename=url_server=document.getElementById("FileToUpload").value;
 console.log(server);
 console.log(filename);

 var jqxhr = $.ajax({
        url: server+'/file/'+filename, /*Flask route in COlab to retrieve a file*/
        method: "GET",
        dataType: "jsonp",
       
        success: function (data) {

           var program=JSON.stringify(data);
           
           program=program.split('\\n'); //we only clean the file from spaces, but we will have take care tabulations etc..
           console.log(program);

           setup_writer();
           writer = outputStream.getWriter();
           writer.write(PASTE_MODE); // we send the file in Paste mode in the terminal
           program.forEach(iterate); //For each line we finish to prepare the line to send in the "iterate" function
           writer.write(CONTROL_D);
           writer.releaseLock();
            
        }
    });
    
}

/**
 * @name readLoop
 * Reads data from the input stream and displays it on screen in the textBox "terminal
 * sensorReads is an array where we store the value received by the usb port
 * For samples taken in less than 5 sec we send the data to spreadsheets each 6sec. 
 * Otherwhise we mantain the frequency of samples that the client wrote in the HTML.
 * This laspse of time is for not lose samples and not be sending samples with a high frequencies to Google
 */
async function readLoop() {
   var j=0;

   // Prepares the pipe for reading from the USB

   const textDecoder = new TextDecoderStream();
   readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
   inputStream = textDecoder.readable
  .pipeThrough(new TransformStream(new LineBreakTransformer()))
  .pipeThrough(new TransformStream(new JSONTransformer()));
   reader = inputStream.getReader();

  while (true) {
        const { value, done } = await reader.read();
        if (value) {
           
             if((value.Timestamp >=0)){
                
                sensorReads.push(value);

                if ((sensorReads.length==1)){
                    appendToTerminal('\n');
                    appendToTerminal('---Data Log-----');
                    appendToTerminal('\n');
                    j=0;
                  }
                
                appendToTerminal(JSON.stringify(sensorReads[j]));
                appendToTerminal('\n');
                j=j+1;
                
                DataSensor=value;
               if ((sensorReads.length==1)){
                   
                    if(temps_ms<5000){ /* For samples taken in less than 5 sec we send the data to spreadsheets each 6sec.*/ 
                        var repeat=6000;

                    }else{
                      
                       var repeat=temps_ms; /* Otherwhise we mantain the frequency of samples that the client wrote in the HTML.*/
                    }
                    
                    sendToColab(index, repeat); /*Send data to Google Colab*/
                   
               }

               if(sensorReads.length==NumSamples){
                    doneTX=true;
                    appendToTerminal('\n');
                    appendToTerminal('---Finish Data Log-----');
                    appendToTerminal('\n');
                    

                }
            }
          }
        
        if (doneTX) {
          
           if(endsend){
              index=0;
              
            }
        }
  }

}

function sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
}

/**
 * @name ppendToTerminal
 * Take the TextBox that acts as a terminal and add the block info in blocs.
 * 
 */
const serialResultsDiv = document.getElementById("serialResults");
async function appendToTerminal(newStuff) {
        serialResultsDiv.innerHTML += newStuff;
        if (serialResultsDiv.innerHTML.length > 3000) serialResultsDiv.innerHTML = serialResultsDiv.innerHTML.slice(serialResultsDiv.innerHTML.length - 3000);

        //scroll down to bottom of div
        serialResultsDiv.scrollTop = serialResultsDiv.scrollHeight;
    }
/**
 * @name writeToStream
 * Gets a writer from the output stream and send the lines to the Spike Prime.
 * @param  {...string} lines lines to send to the Spike Prime
 */
function writeToStream(...lines) {
  
    lines.forEach((line) => {
        writer.write(line + '\n');
    });
    writer.releaseLock();

}

/**
 * @name LineBreakTransformer
 * TransformStream to parse the stream into lines.
 */
class LineBreakTransformer {
  constructor() {
    // A container for holding stream data until a new line.
    this.container = '';
  }

  transform(chunk, controller) {
    
    this.container += chunk;
    const lines = this.container.split('\r\n');
    this.container = lines.pop();
    lines.forEach(line => controller.enqueue(line));


  }

  flush(controller) {
  
    controller.enqueue(this.container);

  }
}


/**
 * @name JSONTransformer
 * TransformStream to parse the stream into a JSON object.
 */
class JSONTransformer {
  transform(chunk, controller) {

    try {
      controller.enqueue(JSON.parse(chunk));
      

    } catch (e) {
        controller.enqueue(chunk);
       
    }
  }
}
/**
 * @name toggleUIConnected
 * Changes the "Connect" button to "Disconnect" label.
 */

function toggleUIConnected(connected) {
  let lbl = 'Connect';
  if (connected) {
    lbl = 'Disconnect';
    flag=true;
  }
  butConnect.textContent = lbl;
  
}
