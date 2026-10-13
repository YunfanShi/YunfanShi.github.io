(function(root){
  'use strict';
  // Short, low-volume tonal cues. No remote files, autoplay, spoken prompts or recurring alarms.
  const notes={start:[[392,0,.11],[523.25,.065,.18]],pause:[[329.63,0,.10],[261.63,.075,.14]],next:[[523.25,0,.09],[659.25,.055,.13]],yellow:[[392,0,.14],[349.23,.14,.16]],red:[[220,0,.10],[220,.16,.10],[293.66,.32,.14]],overtime:[[261.63,0,.17],[196,.20,.23]],finish:[[392,0,.15],[523.25,.10,.20],[659.25,.20,.30]]};
  let context=null;
  async function play(name,config={}){
    if(config.sound===false||config.volume===0)return;
    try{
      if(!context){if(!navigator.userActivation?.isActive)return;const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return;context=new Audio();}
      if(context.state==='suspended'){if(!navigator.userActivation?.isActive)return;await context.resume();}
      if(context.state!=='running')return;
      const level=Math.min(1,Math.max(0,config.volume??.25)),start=context.currentTime+.01;
      for(const [frequency,delay,duration] of notes[name]||[]){
        for(const [ratio,weight] of [[1,1],[2,.12]]){
          const oscillator=context.createOscillator(),gain=context.createGain();oscillator.type='sine';oscillator.frequency.value=frequency*ratio;
          const time=start+delay;gain.gain.setValueAtTime(.00001,time);gain.gain.exponentialRampToValueAtTime(Math.max(.00002,level*.10*weight),time+.018);gain.gain.exponentialRampToValueAtTime(.00001,time+duration+.1);
          oscillator.connect(gain);gain.connect(context.destination);oscillator.start(time);oscillator.stop(time+duration+.11);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
        }
      }
    }catch{/* Audio capability never blocks persistence or timing. */}
  }
  root.PracticeAudio={play};
})(globalThis);
