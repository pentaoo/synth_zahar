import {renderScore} from './folk-score.mjs?v=ritual-10';
self.onmessage = ({data}) => {
  try {
    const score=renderScore(data.sampleRate,data.waves);
    self.postMessage(score,[...score.stems,...score.phraseStems].map(stem=>stem.buffer));
  } catch(error) { self.postMessage({error:error.message}); }
};
