# YAMNet (float16 copy)

- Source: Google YAMNet, TensorFlow.js graph model (Kaggle Models `google/yamnet/tfJs/tfjs/1`, also published on TF Hub).
- Licence: Apache License 2.0. Copyright Google LLC. https://www.apache.org/licenses/LICENSE-2.0
- Change: float32 weights stored as float16 (`tools/q16.js` method; weights dequantised to float32 on load). Topology unchanged.
- Trained by Google on AudioSet (CC BY 4.0 labels). GenreMatch uses only the 1024-d embedding (plus the
  AudioSet genre scores as out-of-domain evidence). No catalogue or song lookup.
