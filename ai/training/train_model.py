import argparse
import json
import shutil
from pathlib import Path

def main():
    p=argparse.ArgumentParser(description='Train a custom AEGIS road model using transfer learning')
    p.add_argument('--data',required=True);p.add_argument('--model',default='yolo26s.pt');p.add_argument('--epochs',type=int,default=100);p.add_argument('--batch',type=int,default=16);p.add_argument('--imgsz',type=int,default=640);p.add_argument('--device',default='cpu');p.add_argument('--lr',type=float,default=.001);p.add_argument('--patience',type=int,default=20);p.add_argument('--workers',type=int,default=4);p.add_argument('--name',default='construction-v1')
    args=p.parse_args()
    if Path(args.name).name!=args.name: raise ValueError('Model name must be a simple directory name')
    if not Path(args.data).is_file(): raise ValueError('Dataset YAML does not exist')
    from ultralytics import YOLO
    model=YOLO(args.model)
    model.train(data=args.data,epochs=args.epochs,batch=args.batch,imgsz=args.imgsz,device=args.device,lr0=args.lr,patience=args.patience,workers=args.workers,project='runs/aegis_vision',name=args.name,exist_ok=False,pretrained=True,plots=True)
    run=Path(model.trainer.save_dir);dest=Path('models')/run.name;dest.mkdir(parents=True,exist_ok=True)
    for name in ['best.pt','last.pt']: shutil.copy2(run/'weights'/name,dest/name)
    (dest/'version.json').write_text(json.dumps(dict(name=run.name,configuration=vars(args),runDirectory=str(run),active=False),indent=2))
    print(f'Model weights: {dest}; plots, epoch metrics and PR curves: {run}')
if __name__=='__main__': main()
