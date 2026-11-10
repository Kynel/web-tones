import { useEffect, useState } from 'react';
import { DI_TRACKS } from '../audio/assets';
import { engine, type InputChannel } from '../audio/engine';
import { useStore } from '../state/store';
import { Knob } from './Knob';
import { Meter } from './Meter';
import { Tuner } from './Tuner';

function useInputDevices(enabled: boolean) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!enabled || !navigator.mediaDevices?.enumerateDevices) return;
    const load = () =>
      navigator.mediaDevices.enumerateDevices().then((all) => setDevices(all.filter((d) => d.kind === 'audioinput')), () => {});
    void load();
    navigator.mediaDevices.addEventListener('devicechange', load);
    return () => navigator.mediaDevices.removeEventListener('devicechange', load);
  }, [enabled]);
  return devices;
}

export function Transport() {
  const s = useStore();
  const [tuner, setTuner] = useState(false);
  const [latency, setLatency] = useState(0);
  const devices = useInputDevices(s.source === 'live' && s.live);
  useEffect(() => {
    if (s.audio !== 'on') return;
    const id = setInterval(() => setLatency(engine.latencyMs()), 1000);
    return () => clearInterval(id);
  }, [s.audio]);

  return (
    <section className="transport" aria-label="입력과 출력">
      <div className="io-group io-source">
        <div className="seg" role="tablist" aria-label="입력 소스">
          <button role="tab" aria-selected={s.source === 'di'} onClick={() => s.setSource('di')}>
            DI 트랙
          </button>
          <button role="tab" aria-selected={s.source === 'live'} onClick={() => s.setSource('live')}>
            내 기타 (라이브)
          </button>
        </div>
        {s.source === 'di' ? (
          <div className="source-row">
            <button
              className="play"
              data-on={s.playing || undefined}
              aria-label={s.playing ? '정지' : '재생'}
              onClick={() => void s.togglePlay()}
            >
              {s.playing ? '■' : '▶'}
            </button>
            <label className="field">
              <span>연주 샘플</span>
              <select value={s.trackId} onChange={(e) => s.setTrack(e.target.value)}>
                {DI_TRACKS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="source-row">
            <button className="play" data-on={s.live || undefined} aria-label={s.live ? '입력 끄기' : '입력 켜기'} onClick={() => void s.toggleLive()}>
              {s.live ? '■' : '●'}
            </button>
            <label className="field">
              <span>입력 장치</span>
              <select value={s.deviceId} onChange={(e) => s.setDevice(e.target.value)} disabled={!s.live}>
                <option value="">{s.live ? '기본 장치' : '● 를 눌러 연결'}</option>
                {devices
                  .filter((d) => d.deviceId && d.deviceId !== 'default')
                  .map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || '오디오 입력'}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field narrow">
              <span>채널</span>
              <select value={s.inputChannel} onChange={(e) => s.setInputChannel(e.target.value as InputChannel)}>
                <option value="mix">모노 합</option>
                <option value="left">1 (L)</option>
                <option value="right">2 (R)</option>
              </select>
            </label>
          </div>
        )}
        {s.source === 'live' && (
          <p className="note" data-error={s.liveError ? true : undefined}>
            {s.liveError ?? '오디오 인터페이스의 Hi-Z 입력에 기타를 연결하세요. 하울링 방지를 위해 헤드폰 사용을 권장합니다.'}
          </p>
        )}
        {s.audioError && (
          <p className="note" data-error role="alert">
            오디오 오류: {s.audioError}
          </p>
        )}
      </div>

      <div className="io-group io-level">
        <Knob label="Input" value={s.inputGain} defaultValue={0} min={-24} max={24} unit="dB" onChange={s.setInputGain} />
        <div className="meter-col">
          <span className="meter-label">IN</span>
          <Meter which="input" label="입력" />
          <button className="btn small" aria-pressed={tuner} onClick={() => setTuner(!tuner)}>
            튜너
          </button>
        </div>
        {tuner && <Tuner />}
      </div>

      <div className="io-group io-level io-out">
        <div className="meter-col">
          <span className="meter-label">OUT</span>
          <Meter which="output" label="출력" />
          <span className="status" data-state={s.audio}>
            {s.audio === 'on'
              ? `48 kHz · 지연 ${latency.toFixed(0)} ms`
              : s.audio === 'starting'
                ? '엔진 시작 중…'
                : s.audio === 'error'
                  ? '엔진 오류'
                  : '재생을 누르면 오디오 엔진이 켜집니다'}
          </span>
        </div>
        <Knob label="Master" value={s.master} defaultValue={-6} min={-40} max={6} unit="dB" onChange={s.setMaster} />
      </div>
    </section>
  );
}
