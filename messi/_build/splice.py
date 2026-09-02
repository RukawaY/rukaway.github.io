import numpy as np, subprocess, json
SRC="bili_yuuu.m4a"; sr=44100
raw=subprocess.run(["ffmpeg","-nostdin","-v","error","-i",SRC,"-ac","2","-ar",str(sr),"-f","f32le","-"],capture_output=True).stdout
x=np.frombuffer(raw,np.float32).reshape(-1,2); mono=x.mean(axis=1)
# onset envelope
hop=256; n=1024; fps=sr/hop
fr=[np.abs(np.fft.rfft(mono[i:i+n]*np.hanning(n))) for i in range(0,len(mono)-n,hop)]
S=np.log1p(np.array(fr)); d=np.diff(S,axis=1*0) if False else None
D=np.diff(S,axis=0); D[D<0]=0; o=D.sum(axis=1); o=(o-o.mean())/o.std()
def score(period, phase, t0, t1):
    ts=np.arange(phase, len(o)/fps, period); ts=ts[(ts>=t0)&(ts<t1)]
    idx=np.clip((ts*fps).astype(int),0,len(o)-1); return o[idx].sum()/max(1,len(ts))
best=None
for period in np.arange(0.560,0.578,0.0002):
    for phase in np.arange(0,period,0.01):
        sc=score(period,phase,36,57)+score(period,phase,129,170)
        if best is None or sc>best[0]: best=(sc,period,phase)
sc,per,ph=best; print(f"beat {per:.4f}s ({60/per:.2f} bpm) phase {ph:.3f}  bar {4*per:.4f}s")
bar=4*per
# find downbeat phase among the 4 beat positions by strongest onsets
cands=[]
for k in range(4):
    p=ph+k*per; cands.append((score(bar,p,36,57)+score(bar,p,129,170),p))
cands.sort(reverse=True); dphase=cands[0][1]; print("downbeat phase", round(dphase,3), [round(c[1],3) for c in cands])
bars=np.arange(dphase, len(mono)/sr, bar)
near=lambda t: float(bars[np.argmin(np.abs(bars-t))])
# cut plan: remove [a,b) at bar boundaries
A1,B1 = near(40.6), near(54.26); A2,B2 = near(136.18), near(161.22)
print("cut1", A1, B1, "bars", round((B1-A1)/bar,2)); print("cut2", A2, B2, "bars", round((B2-A2)/bar,2))
for label,t in [("兰花指(副歌1)",17.72),("嘲笑谁",57.42),("兰花指(副歌2)",111.76),("你一牵",169.22),("风雪(coda1)",205.72),("风雪(coda2)",223.8)]:
    print(f"  {label} at {t}: bar offset {((t-dphase)%bar)/per:.2f} beats")
# splice
def seg(a,b): return x[int(a*sr):int(b*sr)]
xf=int(0.012*sr)
def join(p,q):
    w=np.linspace(0,1,xf)[:,None]; mix=p[-xf:]*(1-w)+q[:xf]*w
    return np.concatenate([p[:-xf],mix,q[xf:]])
out=join(join(seg(0,A1),seg(B1,A2)),seg(B2,len(x)/sr))
new_len=len(out)/sr; print("new length", round(new_len,2))
# fade out near the end: source 244.0 -> new
off2=(B1-A1)+(B2-A2); fade_start=244.0-off2; end=248.0-off2
o2=out[:int(end*sr)].copy(); n0=int(fade_start*sr); ramp=np.linspace(1,0,len(o2)-n0)[:,None]; o2[n0:]*=ramp
o2.astype(np.float32).tofile("spliced.f32")
json.dump({"beat":per,"bar":bar,"downbeat_phase":dphase,"cuts":[[A1,B1],[A2,B2]],"end":end,"fade_start":fade_start},open("splice.json","w"),indent=1)
print("exported", round(len(o2)/sr,2), "s; cuts", [[round(A1,3),round(B1,3)],[round(A2,3),round(B2,3)]], "fade", round(fade_start,2), "->", round(end,2))
