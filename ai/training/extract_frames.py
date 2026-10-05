"""Extract diverse samples and a manifest preserving source groups."""
import argparse
import csv
import random
from pathlib import Path
import cv2
import numpy as np

def extract(args):
    if args.every is not None and args.every <= 0: raise ValueError("Interval must be positive")
    if args.every_frames is not None and args.every_frames < 1: raise ValueError("Frame interval must be positive")
    if args.random_sample is not None and args.random_sample < 1: raise ValueError("Sample count must be positive")
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    cap=cv2.VideoCapture(args.video)
    fps=cap.get(cv2.CAP_PROP_FPS);total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if fps<=0 or total<=0: raise ValueError("Video cannot be decoded")
    interval=args.every_frames or max(1,round((args.every or .7)*fps))
    chosen=set(random.Random(args.seed).sample(range(total),min(total,args.random_sample))) if args.random_sample else None
    index=0;previous=None;rows=[]
    try:
        while True:
            ok,frame=cap.read()
            if not ok: break
            small=cv2.resize(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),(64,64)).astype(float)
            candidate=(index in chosen) if chosen is not None else index%interval==0
            if args.scene_change: candidate=previous is None or np.mean(np.abs(small-previous))>=args.scene_threshold
            if candidate and (previous is None or np.mean(np.abs(small-previous))>=args.dedup_threshold):
                filename=f'{Path(args.video).stem}_{index:08d}.jpg'
                if not cv2.imwrite(str(out/filename),frame): raise RuntimeError("Could not save extracted frame")
                rows.append(dict(image=str((out/filename).resolve()),label=str((out/filename).with_suffix('.txt').resolve()),group=args.group or str(Path(args.video).resolve()),frame=index))
                previous=small
            index+=1
    finally: cap.release()
    with (out/'manifest.csv').open('w',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=['image','label','group','frame']);writer.writeheader();writer.writerows(rows)
    print(f'Extracted {len(rows)} diverse frames. Annotate and place labels beside JPEGs; empty labels represent reviewed negatives.')

def parser():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--video',required=True);p.add_argument('--output',required=True)
    g=p.add_mutually_exclusive_group();g.add_argument('--every',type=float);g.add_argument('--every-frames',type=int);g.add_argument('--random-sample',type=int);g.add_argument('--scene-change',action='store_true')
    p.add_argument('--scene-threshold',type=float,default=20);p.add_argument('--dedup-threshold',type=float,default=3);p.add_argument('--group',help='Camera/location group; use the same group across related videos');p.add_argument('--seed',type=int,default=42)
    return p
if __name__=='__main__': extract(parser().parse_args())
