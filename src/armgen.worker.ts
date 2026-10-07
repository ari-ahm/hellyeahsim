import { buildArm } from './armgen';

self.onmessage = () => {
  const data = buildArm((p, label) => self.postMessage({ type: 'progress', p, label }));
  const transfer = [
    data.positions.buffer, data.normals.buffer, data.colors.buffer, data.vein.buffer, data.nail.buffer,
    data.skinIndex.buffer, data.skinWeight.buffer, data.index.buffer,
  ];
  (self as unknown as Worker).postMessage({ type: 'done', data }, transfer);
};
