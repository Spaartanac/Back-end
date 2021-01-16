import { Body, Controller, Param, Post, Req, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Crud } from "@nestjsx/crud";
import { Article } from "src/controlers/entities/article.entity";
import { features } from "process";
import { AddArticleDto } from "src/dtos/article/add.article.dto";
import { ArticleService } from "src/services/article/article.service";
import {diskStorage} from "multer";
import { StorageConfig } from "config/storage.config";
import { PhotoService } from "src/services/photo/photo.service";
import { Photo } from "src/controlers/entities/photo.entity";
import { ApiResponse } from "src/misc/Api.Response.class";
import * as fileType from 'file-type';
import * as fs from 'fs';
import * as sharp from 'sharp';
@Controller('api/article')
@Crud({
    model:{
        type: Article
    },
    params:{
        id: {
            field:'articleId',
            type: 'number',
            primary: true
        }
    },
    query:{
        join:{
            category_id:{
                eager:true
            },
            photos:{
                eager:true
            },
            articlePrices:{
                eager:true
            },
            articleFeatures: {
                eager:true
            },
            features: {
                    eager:true
            }
        }
    }
})
export class ArticleController{
    constructor(
        public service : ArticleService,
        public photoService: PhotoService
        ){ }

    @Post('createFull')    // POST http://localhost:3000/api/article/createFull/
    createFullArticle(@Body() data: AddArticleDto){
        return this.service.createFullArticle(data);
    }

    @Post(':id/uploadPhoto/') // POST http://localhost:3000/api/article/:id/uploadPhoto/
    @UseInterceptors(
        FileInterceptor('photo', {
            storage: diskStorage({      
                destination: StorageConfig.photo.destination,
                filename: (req, file, callback) =>{
                    let original = file.originalname;
                    
                    let normalized = original.replace(/\s+/g, '-');
                    normalized = normalized.replace(/[^A-z0-9\.\-]./g, '');
                    let sada = new Date();
                    let datePart = '';
                    datePart += sada.getFullYear().toString();
                    datePart += (sada.getMonth()+1).toString();
                    datePart += sada.getDate.toString();

                    let randomPart: string = 
                        new Array(10)
                        .fill(0)
                        .map(e => (Math.random() * 9).toFixed(0).toString())
                        .join(' ');
                    let fileName = datePart + '-' + randomPart + '-' + normalized;
                    fileName = fileName.toLocaleLowerCase();
                    callback(null , fileName);
                }
            }),
            fileFilter: (req, file, callback) =>{
                if (!file.originalname.toLowerCase().match(/\.(jpg|png)$/)){
                    req.fileFilterError = 'Bad file extensions!';
                    callback(null , false);
                    return;
                }

                if(!(file.mimetype.includes('jpeg') || file.mimetype.includes('png'))){
                    req.fileFilterError = 'Bad file content type!';
                    callback(null , false);
                    return;
                }

                callback(null, true);
            },
            limits: {   
                files: 1,
                fileSize: StorageConfig.photo.maxSize,
            },
        })
    )
    async uploadPhoto(
        @Param('id') aricleId: number,
        @UploadedFile() photo,
        @Req() req
        ): Promise <ApiResponse| Photo>{
            if (req.fileFilterError){
                return new ApiResponse('error', -4002, req.fileFilterError);
            }

            if(!photo){
                return new ApiResponse('error', -4002, 'File not uploaded');
            }
        console.log(photo);
        const fileTypeResult = await fileType.fromFile(photo.path);
            if(!fileTypeResult){
                fs.unlinkSync(photo.path);
                return new ApiResponse('error', -4002, 'Can not detect file type!');
        }

        const realMimeType = fileTypeResult.mime;
        if(!(realMimeType.includes('jpeg') || realMimeType.includes('png'))){
            fs.unlinkSync(photo.path);
            return new ApiResponse('error', -4002, 'Bad file content type!');
        }

        await this.createResizedImage(photo, StorageConfig.photo.resize.thumb);
        await this.createResizedImage(photo, StorageConfig.photo.resize.small);

       const newPhoto: Photo = new Photo();
       newPhoto.articleId = aricleId;
       newPhoto.imagePath = photo.filename;

       const savedPhoto = await this.photoService.add(newPhoto);
       if (!savedPhoto){
           return new ApiResponse('error', -4001);
       }
       return savedPhoto;
    }

    async createThumb(photo){
      await this.createResizedImage(photo, StorageConfig.photo.resize.thumb);
    }
    async createSmallImage(photo){
      await this.createResizedImage(photo, StorageConfig.photo.resize.small);
    }

    async createResizedImage(photo , resizeSettings){
        const originalFilePath = photo.path;
        const fileName = photo.filename;

        const destinationFilePath = StorageConfig.photo.destination + resizeSettings.directory + fileName;
       await sharp(originalFilePath)
        .resize({
            fit:'cover',
            width: resizeSettings.width,
            height: resizeSettings.height,
        })
        .toFile(destinationFilePath);
    }
}