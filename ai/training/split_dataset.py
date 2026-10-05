"""Split complete camera/video/location groups, never neighboring frames."""
import argparse
import csv
import random
import shutil
from collections import defaultdict
from pathlib import Path
import yaml

def split(manifest,output,seed=42):
    groups=defaultdict(list)
    with Path(manifest).open() as f:
        for row in csv.DictReader(f):
            if not row.get('group'): raise ValueError('Every frame requires a source group')
            image,label=Path(row['image']),Path(row['label'])
            if not image.is_file() or not label.is_file(): raise ValueError(f'Missing image or annotation: {image}; use explicit empty labels for reviewed negatives')
            for line in label.read_text().splitlines():
                values=line.split()
                if len(values)!=5: raise ValueError(f'Invalid YOLO label: {label}')
                cls,x,y,w,h=map(float,values)
                if cls!=int(cls) or not 0<=cls<20 or not all(0<=v<=1 for v in [x,y,w,h]) or w<=0 or h<=0: raise ValueError(f'Invalid class or normalized box: {label}')
            groups[row['group']].append(row)
    if len(groups)<3: raise ValueError('At least three independent groups required for train/val/test')
    keys=list(groups);random.Random(seed).shuffle(keys)
    n=len(keys);train=min(n-2,max(1,round(.7*n)));val=min(n-train-1,max(1,round(.2*n)))
    allocation={key:('train' if i<train else 'val' if i<train+val else 'test') for i,key in enumerate(keys)}
    root=Path(output).resolve()
    if (root/'data.yaml').exists(): raise ValueError('Output dataset already exists; use a new version directory')
    counts={name:0 for name in ['train','val','test']}
    for i,key in enumerate(keys):
        part=allocation[key]
        for j,row in enumerate(groups[key]):
            basename=f'g{i:05d}_f{j:08d}'
            for kind,source in [('images',Path(row['image'])),('labels',Path(row['label']))]:
                dest=root/kind/part;dest.mkdir(parents=True,exist_ok=True)
                shutil.copy2(source,dest/(basename+source.suffix))
            counts[part]+=1
    classes=yaml.safe_load((Path(__file__).resolve().parents[2]/'config/classes.yaml').read_text())['names']
    (root/'data.yaml').write_text(yaml.safe_dump(dict(path=str(root),train='images/train',val='images/val',test='images/test',names=classes)))
    (root/'source_split.yaml').write_text(yaml.safe_dump(dict(groups=allocation,imageCounts=counts)))
    print(counts)
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--manifest',required=True);p.add_argument('--output',required=True);p.add_argument('--seed',type=int,default=42);a=p.parse_args();split(a.manifest,a.output,a.seed)
