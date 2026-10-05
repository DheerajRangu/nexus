"""Prepare local perception weights once; inference performs no text-encoder download."""
import json
import argparse
from pathlib import Path
import yaml
from ai import _runtime
ROOT=Path(__file__).resolve().parents[1]

def main():
    import torch
    import clip
    from ultralytics import YOLOWorld
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download',action='store_true',help='Download official public model assets before preparing')
    args=parser.parse_args()
    config=yaml.safe_load((ROOT/'config/omnivision.yaml').read_text())
    names=list(config['prompts']);prompts=list(config['prompts'].values())
    if args.download:
        from huggingface_hub import snapshot_download
        snapshot_download('nvidia/segformer-b0-finetuned-cityscapes-1024-1024',local_dir=ROOT/config['segmentation_model'],allow_patterns=['config.json','preprocessor_config.json','pytorch_model.bin','model.safetensors'])
        encoder,_=clip.load('ViT-B/32',device='cpu',download_root=str(ROOT/'models/clip'),jit=False)
    else:
        if not (ROOT/'models/clip/ViT-B-32.pt').is_file():raise FileNotFoundError('CLIP checkpoint missing; run python -m ai.prepare_models --download')
        encoder,_=clip.load(str(ROOT/'models/clip/ViT-B-32.pt'),device='cpu',jit=False)
    with torch.inference_mode():
        features=encoder.encode_text(clip.tokenize(prompts)).float()
        features=features/features.norm(dim=-1,keepdim=True)
    model=YOLOWorld(str(ROOT/'models/yolov8s-worldv2.pt'))
    model.model.txt_feats=features.unsqueeze(0)
    model.model.model[-1].nc=len(names)
    model.model.names=dict(enumerate(names))
    model.model.clip_model=None
    model.save(str(ROOT/config['open_vocabulary_model']))
    (ROOT/'models/omnivision-world.json').write_text(json.dumps({'model':'YOLOv8s-Worldv2','classes':config['prompts'],'experimental':True},indent=2))
    print('Prepared offline OmniVision object model:',ROOT/config['open_vocabulary_model'])
if __name__=='__main__':main()
