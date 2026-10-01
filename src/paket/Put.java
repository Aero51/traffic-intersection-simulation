/*
 * To change this template, choose Tools | Templates
 * and open the template in the editor.
 */
package paket;

import java.util.List;
import javafx.animation.PathTransition;
import javafx.animation.Timeline;
import javafx.application.Application;
import javafx.scene.Group;
import javafx.scene.paint.Color;
import javafx.scene.shape.ArcTo;
import javafx.scene.shape.Circle;
import javafx.scene.shape.CubicCurveTo;
import javafx.scene.shape.LineTo;
import javafx.scene.shape.MoveTo;
import javafx.scene.shape.Path;
import javafx.scene.shape.Rectangle;
import javafx.scene.shape.Shape;
import javafx.util.Duration;

/**
 *
 * @author Nikola
 */
public class Put {
 private Path putGore(final double pathOpacity)
   {
      final Path put = new Path();
     // put.getElements().add(new MoveTo(20,20));
     // put.getElements().add(new CubicCurveTo(800, 0, 380, 120, 200, 120));
      // put.getElements().add(new CubicCurveTo(703,466, 542, 375, 18,4));
      // put.getElements().add(new 
      
      
     // put.getElements().add(new CubicCurveTo(0, 120, 0, 240, 380, 240));
      
      put.getElements().add(new MoveTo(703,466) );
        put.getElements().add(new LineTo(542,375) );
       put.getElements().add(new LineTo(396,287) );
        put.getElements().add(new LineTo(275,204) );
         put.getElements().add(new LineTo(159,118) );
          put.getElements().add(new LineTo(18,4) );
        
      
     put.getElements().add(new MoveTo(653,470) );
        put.getElements().add(new LineTo(446,357) );
       put.getElements().add(new LineTo(316,275) );
        put.getElements().add(new LineTo(182,177) );
         put.getElements().add(new LineTo(1,39) );
         
     
          put.getElements().add(new MoveTo(2,73) );
        put.getElements().add(new LineTo(64,128) );
       put.getElements().add(new LineTo(279,283) );
        put.getElements().add(new LineTo(395,361) );
         put.getElements().add(new LineTo(519,436) );
          put.getElements().add(new LineTo(582,471) );
          
          
          
              put.getElements().add(new MoveTo(0,117) );
        put.getElements().add(new LineTo(53,157) );
       put.getElements().add(new LineTo(279,324) );
        put.getElements().add(new LineTo(453,436) );
         put.getElements().add(new LineTo(498,471) );
         
         
         
       put.getElements().add(new MoveTo(703,466) );
       put.getElements().add(new LineTo(542,375) );
       put.getElements().add(new LineTo(396,287) );
       put.getElements().add(new ArcTo(5, 10, 25, 451, 137, false, true));
       put.getElements().add(new LineTo(637,101) );
       put.getElements().add(new LineTo(891,47) );
       
       put.getElements().add(new MoveTo(892,14) );
       put.getElements().add(new LineTo(543,82) );
       put.getElements().add(new LineTo(377,98) );
       put.getElements().add(new LineTo(288,93) );
       put.getElements().add(new LineTo(169,74) );
       put.getElements().add(new LineTo(58,35) );
       put.getElements().add(new LineTo(14,0) );
       
       
        put.getElements().add(new MoveTo(892,14) );
        put.getElements().add(new LineTo(543,82) );
        put.getElements().add(new LineTo(449,98) );
        put.getElements().add(new ArcTo(-5, 10, 30, 315, 307, false, false));
      //  new ArcTo
       
       put.getElements().add(new LineTo(582,470 ));
       
       
        put.getElements().add(new MoveTo(0,73) );
        put.getElements().add(new LineTo(64,128) );
      //  put.getElements().add(new ArcTo(10, 0, 25, 441, 136, true, true));
        put.getElements().add(new LineTo(441,136) );
        put.getElements().add(new LineTo(637,101) );
        put.getElements().add(new LineTo(891,47) );
       
     
       
       //  new ArcTo
         
         
   //  ArcTo arc = new ArcTo(d, d1, d2, d3, d4, pocetno, pocetno)
  
            
     
      
      
      
      
     // put.getElements().add(new MoveTo(703,466));
      put.setOpacity(pathOpacity);
 
      
      return put;
      
   }
    

   /**
    * Generate the path transition.
    * 
    * @param shape Shape to travel along path.
    * @param path Path to be traveled upon.
    * @return PathTransition.
    */
   private PathTransition generatePathTransition(final Shape shape, final Path path)
   {
      final PathTransition pathTransition = new PathTransition();
      pathTransition.setDuration(Duration.seconds(8.0));
      pathTransition.setDelay(Duration.seconds(2.0));
      pathTransition.setPath(path);
      pathTransition.setNode(shape);
      pathTransition.setOrientation(PathTransition.OrientationType.ORTHOGONAL_TO_TANGENT);
      pathTransition.setCycleCount(Timeline.INDEFINITE);
     // pathTransition.setAutoReverse(true);
      return pathTransition;
   }

   /**
    * Determine the path's opacity based on command-line argument if supplied
    * or zero by default if no numeric value provided.
    * 
    * @return Opacity to use for path.
    */
 

   /**
    * Apply animation, the subject of this class.
    * 
    * @param group Group to which animation is applied.
    */
   private void applyAnimation(final Group group)
   {
     
      final Path path =putGore(1);
      group.getChildren().add(path);
       Rectangle pravo = new Rectangle(20,20);
       group.getChildren().add(pravo);
        pravo.setFill(Color.RED);
        
        
        Rectangle pravo2 = new Rectangle(20,20);
        group.getChildren().add(pravo2);
        pravo2.setFill(Color.WHITE);
      
      
          Rectangle pravo3 = new Rectangle(20,20);
        group.getChildren().add(pravo3);
        pravo3.setFill(Color.BLUE);
        
        
      
        final PathTransition transition = generatePathTransition(pravo, path);
  final PathTransition transition2=  generatePathTransition(pravo2, path);
 
  
   final PathTransition transition3=  generatePathTransition(pravo3, path);
  
  
  
  
transition2.setDelay(Duration.millis(250));
     transition.play(); 
      
      transition2.play();
      transition3.setDelay(Duration.millis(350));
      transition3.play();
     
     
   }
                                 
      
}


