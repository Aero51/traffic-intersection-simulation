package paket;

import com.fxexperience.javafx.animation.FlipInYTransition;
import com.fxexperience.javafx.animation.FlipOutYTransition;
import com.javafx.experiments.scenicview.ScenicView;
import de.thomasbolz.javafx.NumberSpinner;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import javafx.animation.Interpolator;
import javafx.animation.KeyFrame;
import javafx.animation.PathTransition;
import javafx.animation.Timeline;
import javafx.animation.TimelineBuilder;
import javafx.animation.TranslateTransition;
import javafx.animation.TranslateTransitionBuilder;
import javafx.application.Application;
import javafx.beans.property.IntegerProperty;
import javafx.beans.property.SimpleIntegerProperty;
import javafx.beans.value.ChangeListener;
import javafx.beans.value.ObservableValue;
import javafx.event.ActionEvent;
import javafx.event.EventHandler;
import javafx.event.EventType;
import javafx.geometry.VPos;
import javafx.scene.Group;
import javafx.scene.GroupBuilder;
import javafx.scene.Scene;
import javafx.scene.SceneBuilder;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonBuilder;
import javafx.scene.control.CheckBox;
import javafx.scene.control.CheckBoxBuilder;
import javafx.scene.control.ChoiceBox;
import javafx.scene.control.ChoiceBoxBuilder;
import javafx.scene.control.Slider;
import javafx.scene.control.SliderBuilder;
import javafx.scene.control.ToolBarBuilder;
import javafx.scene.control.Tooltip;
import javafx.scene.effect.Blend;
import javafx.scene.effect.BlendMode;
import javafx.scene.effect.DropShadow;
import javafx.scene.effect.Effect;
import javafx.scene.effect.Glow;
import javafx.scene.effect.InnerShadow;
import javafx.scene.image.Image;
import javafx.scene.image.ImageView;
import javafx.scene.image.ImageViewBuilder;
import javafx.scene.input.MouseEvent;
import javafx.scene.paint.Color;
import javafx.scene.paint.LinearGradientBuilder;
import javafx.scene.paint.Stop;
import javafx.scene.shape.ArcTo;
import javafx.scene.shape.Line;
import javafx.scene.shape.LineBuilder;
import javafx.scene.shape.LineTo;
import javafx.scene.shape.MoveTo;
import javafx.scene.shape.Path;
import javafx.scene.shape.Rectangle;
import javafx.scene.shape.RectangleBuilder;
import javafx.scene.shape.Shape;
import javafx.scene.text.Font;
import javafx.scene.text.FontWeight;
import javafx.scene.text.Text;
import javafx.scene.text.TextBuilder;
import javafx.stage.Stage;
import javafx.util.Duration;
import jfxtras.labs.scene.control.SlideLock;
import jfxtras.labs.scene.control.SlideLockBuilder;
import jfxtras.labs.scene.control.gauge.*;
import projavafx.audioconfig.model.AudioConfigModel;

public class GlavnaKlasa extends Application {
    // private Semafor svjetlo;

    //public IntegerProperty bindingMeni = new SimpleIntegerProperty(1);
    public IntegerProperty bindingSemafora = new SimpleIntegerProperty(1);
    public SimpleIntegerProperty odabirSemPrihvati = new SimpleIntegerProperty(1);
    public SimpleIntegerProperty odabirBind = new SimpleIntegerProperty(1);
    public SimpleIntegerProperty otvorenostBind = new SimpleIntegerProperty();
    public SimpleIntegerProperty zatvorenostBind = new SimpleIntegerProperty();
    // public int veza;
    private ArrayList<Semafor> listaSemafora = new ArrayList<>();
    private ArrayList<SemaforPjesaci> listaPjesaka = new ArrayList<>();
    private ArrayList<Skretaci> listaSkretaca = new ArrayList<>();
    private ArrayList<Timeline> listaAnimacija = new ArrayList<>();
    private ArrayList<Integer> listaOtvorenosti = new ArrayList<>();
    private ArrayList<Integer> listaZatvorenosti = new ArrayList<>();
    private Boolean pocetno = true;
    private Boolean prviPrebacaj = true;
    private Boolean iskljuciPjesake = true;
    private Timeline referentnoVrijeme = new Timeline();
   private ArrayList<Rectangle> listaPravokutnika = new ArrayList<>();
    private PathTransition transition;
    
    // private Timeline animacijaSemafora = new Timeline();

    @Override
    public void start(final Stage stage) {
        
     
        
        
        stage.setMaxWidth(900);
        stage.setMaxHeight(500);
        // bindingSemafora.bindBidirectional(bindingMeni);
        Text textDb;
        Slider slider;
        CheckBox mutingCheckBox;
        final ChoiceBox genreChoiceBox;
        final Button prihvati, tipkaloButton;
        final Group iphoneMenu;
        final Group semafori;
        Rectangle klikabilno;
        Rectangle bijelaPozadina;
        AudioConfigModel izbornikModel = new AudioConfigModel();
        final Text textZatvorenost, textOtvorenost, textCycleSemafora;


        SemaforBuilder builder = SemaforBuilder.create()
                .darkBackground(true)
                .prefHeight(40)
                .prefWidth(16);

        SemaforPjesaciBuilder pjesaciBuilder = SemaforPjesaciBuilder.create()
                .prefHeight(40)
                .prefWidth(16);
        SkretaciBuilder skretaciBuilder = SkretaciBuilder.create()
                .prefHeight(40)
                .prefWidth(16);

        final Semafor semafor01 = builder.layoutX(492).layoutY(291).build();//____________3
        semafor01.setRotate(300);
        final Semafor semafor02 = builder.layoutX(466).layoutY(344).build();//________________04
        semafor02.setRotate(210);

        final Semafor semafor03 = builder.layoutX(40).layoutY(170).build();//_----------------07
        semafor03.setRotate(130);
        final Semafor semafor04 = builder.layoutX(91).layoutY(130).build();//________________08
        semafor04.setRotate(30);
        final Semafor semafor05 = builder.layoutX(492).layoutY(29).build();//____________09
        semafor05.setRotate(270);

        SemaforPjesaci semafor06 = pjesaciBuilder.layoutX(461).layoutY(282).build();
        semafor06.setDarkBackground(true);
        semafor06.setRotate(30);
        SemaforPjesaci semafor07 = pjesaciBuilder.layoutX(385).layoutY(395).build();
        semafor07.setRotate(210);
        SemaforPjesaci semafor08 = pjesaciBuilder.layoutX(459).layoutY(39).build();
        semafor08.setRotate(170);
        SemaforPjesaci semafor09 = pjesaciBuilder.layoutX(470).layoutY(135).build();
        semafor09.setRotate(170);

        Skretaci semafor10 = skretaciBuilder.layoutX(509).layoutY(283).build();

        Skretaci semafor11 = skretaciBuilder.layoutX(85).layoutY(112).build();
        semafor11.toBack();
        Skretaci semafor12 = skretaciBuilder.layoutX(504).layoutY(16).build();

        Effect efekt = new Glow(0.8);
        semafori = GroupBuilder.create().children(semafor01, semafor02, semafor03, semafor04, semafor05, semafor06, semafor07, semafor08, semafor09, semafor10, semafor11, semafor12/*, semafor13, semafor14,semafor15*/).build();

        listaSemafora.add(semafor01);
        listaSemafora.add(semafor02);
        listaSemafora.add(semafor03);
        listaSemafora.add(semafor04);
        listaSemafora.add(semafor05);

        listaPjesaka.add(semafor06);
        listaPjesaka.add(semafor07);
        listaPjesaka.add(semafor08);
        listaPjesaka.add(semafor09);

        listaSkretaca.add(semafor10);
        listaSkretaca.add(semafor11);
        listaSkretaca.add(semafor12);

        for (int i = 0; i < 4; i++) // za dodavanje u listu pocetnih vremena zatv i otv  za prva 4 semafora
        {
            listaOtvorenosti.add(10);
            listaZatvorenosti.add(10);
        }
        listaOtvorenosti.add(4);   // za peti semafor
        listaZatvorenosti.add(13);


        for (int i = 0; i < listaSemafora.size(); i++) {
            listaSemafora.get(i).setId(String.valueOf(i + 1));
        }
        for (int i = 0; i < listaPjesaka.size(); i++) {
            listaPjesaka.get(i).setId(String.valueOf(i + 6));
        }

        final Scene scene;
        final Group grupa_elementi_aplikacije;
        scene = SceneBuilder.create()
                .width(900)
                .height(500)
                .root(
                grupa_elementi_aplikacije = GroupBuilder.create()
                .children(
                ImageViewBuilder.create()
                .image(new Image("zadnje.png"))
                .build(),
                // dodajListenere(semafori), // tu se kreiraju semafori koji ne svjetle :) - zove se metoda koja ubacuje listenere na svaki i vraca grupu semafora
                tipkaloButton = ButtonBuilder.create().text("Tipkalo").id("Tipkalo").layoutX(477).layoutY(211).build(),
                //builder.build(), // bilder za instancu semafora

                //TrafficLightBuilder.create()

                iphoneMenu = GroupBuilder.create() // ova grupa je dijete gornje grupe
                // GroupBuilder.create()
                .layoutX(585)
                .layoutY(434)
                .children(
                klikabilno = RectangleBuilder.create()
                .width(320) //gornji pravokutnik
                .height(45)
                .arcWidth(20)
                .arcHeight(20)
                .fill(
                LinearGradientBuilder.create()
                .endX(0.0)
                .endY(1.0)
                .stops(
                new Stop(0, Color.web("0xAEBBCC")),
                new Stop(1, Color.web("0x6D84A3")))
                .build())
                .build(),
                TextBuilder.create()
                .layoutX(65)
                .layoutY(12)
                .textOrigin(VPos.TOP)
                .fill(Color.WHITE)
                .text("Izbornik")
                .font(Font.font("SansSerif", FontWeight.BOLD, 20))
                .build(),
                RectangleBuilder.create()
                .x(0)
                .y(43)
                .width(320)
                .height(300)
                .fill(Color.rgb(199, 206, 213))
                .build(),
                bijelaPozadina = RectangleBuilder.create()
                .x(9)
                .y(54)
                .width(300)
                .height(294) // bijela pozadina
                .arcWidth(20)
                .arcHeight(20)
                .fill(Color.WHITE)
                .stroke(Color.color(0.66, 0.67, 0.69))
                .build(),
                textDb = TextBuilder.create()
                .layoutX(18)
                .layoutY(500)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .font(Font.font("SansSerif", FontWeight.BOLD, 18))
                .build(),
                slider = SliderBuilder.create()
                .layoutX(135)
                .layoutY(500)
                .prefWidth(162)
                .build(),
                LineBuilder.create()
                .startX(9)
                .startY(97)
                .endX(309)
                .endY(97)
                .stroke(Color.color(0.66, 0.67, 0.69))
                .build(),
                TextBuilder.create()
                .layoutX(18)
                .layoutY(544)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Check box")
                .font(Font.font("SanSerif", FontWeight.BOLD, 18))
                .build(),
                mutingCheckBox = CheckBoxBuilder.create()
                .layoutX(280)
                .layoutY(544)
                .build(),
                LineBuilder.create()
                .startX(9)
                .startY(141)
                .endX(309)
                .endY(141)
                .stroke(Color.color(0.66, 0.67, 0.69))
                .build(),
                TextBuilder.create()
                .layoutX(18)
                .layoutY(66)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Mod rada")
                .font(Font.font("SanSerif", FontWeight.BOLD, 18))
                .build(),
                textOtvorenost = TextBuilder.create()
                .layoutX(18)
                .layoutY(150)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Vrijeme otvorenosti:")
                .font(Font.font("SanSerif", FontWeight.BOLD, 18)).opacity(1)
                .build(),
                textZatvorenost = TextBuilder.create()
                .layoutX(18)
                .layoutY(194)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Vrijeme zatvorenosti:")
                .font(Font.font("SanSerif", FontWeight.BOLD, 18)).opacity(1)
                .build(),
                TextBuilder.create()
                .layoutX(18)
                .layoutY(239)
                .textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Update:13.06.2013")
                .font(Font.font("SanSerif", FontWeight.EXTRA_LIGHT, 18))
                .build(),
                textCycleSemafora = TextBuilder.create()
                .layoutX(18)
                .layoutY(106).textOrigin(VPos.TOP)
                .fill(Color.web("#131021"))
                .text("Semafor:")
                .font(Font.font("SanSerif", FontWeight.BOLD, 18)).opacity(1)
                .build(),
                genreChoiceBox = ChoiceBoxBuilder.create()
                .layoutX(204)
                .layoutY(66)
                .prefWidth(93)
                .items(izbornikModel.genres)//.disable(true)
                .build(),
                LineBuilder.create()
                .startX(9)
                .startY(185) //   44 je razlika do sljedece crte
                .endX(309)
                .endY(185)
                .stroke(Color.color(0.66, 0.67, 0.69))
                .build(),
                LineBuilder.create()
                .startX(9)
                .startY(229) //   44 je razlika do sljedece crte
                .endX(309)
                .endY(229)
                .stroke(Color.color(0.66, 0.67, 0.69))
                .build(),
                ToolBarBuilder.create()
                .id("iphone-toolbar")
                .layoutX(10)
                .layoutY(290)
                .stylesheets(GlavnaKlasa.class.getResource("Buttons.css").toExternalForm())
                .items(
                prihvati = ButtonBuilder.create().text("Prihvati").id("iphone").build())
                .build())
                .build())
                .build())
                .build();
//___________________________________________________________________________________________________________________________
        final ChangeListener listenerPromjenePrihvati = new ChangeListener() {
            @Override
            public void changed(ObservableValue observableValue, Object oldValue, Object newValue) {
                System.out.println("oldvalue:" + oldValue);
                System.out.println("newvalue:" + newValue);
            }
        };
        textDb.textProperty().bind(izbornikModel.selectedDBs.asString().concat(" dB"));
        slider.valueProperty().bindBidirectional(izbornikModel.selectedDBs);
        slider.disableProperty().bind(izbornikModel.muting);
        mutingCheckBox.selectedProperty().bindBidirectional(izbornikModel.muting);
        izbornikModel.genreSelectionModel = genreChoiceBox.getSelectionModel();

        izbornikModel.addListenerToGenreSelectionModel();
        izbornikModel.genreSelectionModel.selectFirst();

        final NumberSpinner spinnerOtvoreno = new NumberSpinner();
        spinnerOtvoreno.setLayoutX(214);
        spinnerOtvoreno.setLayoutY(150);
        spinnerOtvoreno.setMaxWidth(50);

        spinnerOtvoreno.setNumber(BigDecimal.valueOf(10));
        otvorenostBind.bindBidirectional(spinnerOtvoreno.button);
        iphoneMenu.getChildren().add(14, spinnerOtvoreno);

        final NumberSpinner spinnerZatvoreno = new NumberSpinner();
        spinnerZatvoreno.setLayoutX(214);
        spinnerZatvoreno.setLayoutY(194);
        spinnerZatvoreno.setMaxWidth(50);
        spinnerZatvoreno.setDisable(true);
        spinnerZatvoreno.setNumber(BigDecimal.valueOf(10));
        zatvorenostBind.setValue(10);
        zatvorenostBind.bindBidirectional(spinnerZatvoreno.button);
        iphoneMenu.getChildren().add(15, spinnerZatvoreno);

        final NumberSpinner spinnerCycleSemafora = new NumberSpinner();
        spinnerCycleSemafora.setLayoutX(214);
        spinnerCycleSemafora.setLayoutY(106);
        spinnerCycleSemafora.setMaxWidth(50);

        odabirBind.bindBidirectional(spinnerCycleSemafora.button);

        iphoneMenu.getChildren().add(16, spinnerCycleSemafora);

        prihvati.setOnMouseReleased(new EventHandler<MouseEvent>() {
            public void handle(MouseEvent me) {

                listaAnimacija.get((odabirBind.get()) - 1).getKeyFrames().clear();
                listaAnimacija.remove((odabirBind.get()) - 1);
                stopOdabranog((odabirBind.get()) - 1);

                listaOtvorenosti.remove(odabirBind.getValue() - 1);
                listaOtvorenosti.add(odabirBind.getValue() - 1, Integer.valueOf(spinnerOtvoreno.getNumber().toString()));
                listaZatvorenosti.remove(odabirBind.getValue() - 1);
                listaZatvorenosti.add(odabirBind.getValue() - 1, Integer.valueOf(spinnerZatvoreno.getNumber().toString()));
                podesavanjeSemaforaZadnje((odabirBind.get()) - 1);

               int referentnaAnimacija=1;
               int velicinaListe=  listaAnimacija.size();
               if((odabirBind.get()) - 1 == referentnaAnimacija)
               {
               referentnaAnimacija = 2 ;
               }
               // listaAnimacija.get((odabirBind.get()) - 1).playFrom(referentnoVrijeme.getCurrentTime());
                 listaAnimacija.get((odabirBind.get()) - 1).playFrom(listaAnimacija.get(referentnaAnimacija).getCurrentTime());
               
            }
        });
        tipkaloButton.setOnMouseReleased(new EventHandler<MouseEvent>() {
            public void handle(MouseEvent me) {
                iskljuciPjesake = false;
            }
        });
        final ChangeListener listenerPromjene = new ChangeListener() {
            @Override
            public void changed(ObservableValue observableValue, Object oldValue, Object newValue) {
                int zatvoreno = Integer.valueOf(spinnerZatvoreno.getNumber().toString());
                int otvoreno = Integer.valueOf(spinnerOtvoreno.getNumber().toString());
                spinnerOtvoreno.setNumber(BigDecimal.valueOf(otvoreno));

                System.out.println("otvoreno:" + otvoreno);
                System.out.println("zatvoreno:" + zatvoreno);

                System.out.println("oldValue:" + oldValue.toString());
                System.out.println("newValue:" + newValue.toString());
                System.out.println("observableValue:" + observableValue.toString());

                int obzerve = Integer.parseInt(observableValue.getValue().toString());

                if (prviPrebacaj == true && (bindingSemafora.get() - 1) == 4) {
                    System.err.println("hura");
                    oldValue = listaOtvorenosti.get(bindingSemafora.get() - 1);  //
                    prviPrebacaj = false;
                }
                if ((int) newValue > (int) oldValue) //casting integera
                {
                    zatvoreno--;
                }
                if ((int) oldValue > (int) newValue) {
                    zatvoreno++;
                }
                spinnerZatvoreno.setNumber(BigDecimal.valueOf(zatvoreno));
            }
        };
        final ChangeListener listenerPromjeneSemafora = new ChangeListener() {
            @Override
            public void changed(ObservableValue observableValue, Object oldValue, Object newValue) {
                System.out.println("change za selekciju sem: oldValue = " + oldValue + ", newValue = " + newValue);
                spinnerCycleSemafora.setNumber(BigDecimal.valueOf(bindingSemafora.get()));

                int privremeno = Integer.valueOf(newValue.toString());
                spinnerOtvoreno.setNumber(BigDecimal.valueOf(listaOtvorenosti.get(privremeno - 1)));
                spinnerZatvoreno.setNumber(BigDecimal.valueOf(listaZatvorenosti.get(privremeno - 1)));

                semafori.getChildren().get((bindingSemafora.get()) - 1).setScaleX(2);
                semafori.getChildren().get((bindingSemafora.get()) - 1).setScaleY(2);
                semafori.getChildren().get((Integer.parseInt(oldValue.toString())) - 1).setScaleX(1);
                semafori.getChildren().get((Integer.parseInt(oldValue.toString())) - 1).setScaleY(1);
            }
        };

        genreChoiceBox.setTooltip(new Tooltip("Dodatne informacije"));
        genreChoiceBox.getSelectionModel().selectedIndexProperty().addListener(new ChangeListener<Number>() {
            @Override
            public void changed(ObservableValue ov, Number value, Number new_value) {
                if (genreChoiceBox.getSelectionModel().isSelected(2)) {
                    sviStop();
                    treptanje();
                }
                if (genreChoiceBox.getSelectionModel().isSelected(0)) {
                    sviStop();
                    izradilistuAnimacija(grupa_elementi_aplikacije);
                    
                    
                    
                }
            }
        });

        scene.setFill(Color.BLACK);
        stage.setTitle("Aplikacija za simulaciju rada semafora");
        scene.setOnMouseMoved(new EventHandler<MouseEvent>() {
            public void handle(MouseEvent me) {
                // showOnConsole("Mouse moved, x: " + me.getX() + ", y: " + me.getY() );
                // System.out.println("X: "+(me.getSceneX()-330)+"Y: "+(me.getSceneY()-170));  //skaliran je semafor, pa mu je pomaknuta pocetna tocka u koordinatnom sistemu
                // System.out.println(" getx: "+  me.getX()+"gety: "+me.getY());
            }
        });

        klikabilno.setOnMouseEntered(new EventHandler<MouseEvent>() {
            @Override
            public void handle(MouseEvent event) {
                //prebacit stil u css ,  ovaj listener je u stvari nepotreban...Definirat kako ce izgledat na mouse entered, pressed  itd...
            }
        });
        klikabilno.setOnMousePressed(new EventHandler<MouseEvent>() //listeneri
        {
            int brojac = 0;

            @Override
            public void handle(MouseEvent me) {
                TranslateTransition transition = TranslateTransitionBuilder.create()
                        .node(iphoneMenu)
                        .fromY(0)
                        .toY(-303)
                        .duration(Duration.millis(700))
                        .interpolator(Interpolator.EASE_IN)
                        .cycleCount(1)
                        .build();
                if (brojac == 0) {
                    transition.play();
                    brojac = 1;
                } else {

                    transition.setRate(-0.5);

                    transition.jumpTo(Duration.millis(700));
                    transition.play();

                    brojac = 0;
                }
            }
        });
        // _______________________________________________Pocetni ekran_____________________________  
        SlideLock slideLock4 = SlideLockBuilder.create()
                .layoutX(175)
                .layoutY(320)
                .text("Povuci za Start")
                .backgroundVisible(true)
                .buttonGlareVisible(true)
                .buttonArrowBackgroundColor(Color.WHITE)
                .buttonColor(LinearGradientBuilder.create()
                .proportional(true)
                .startX(0)
                .startY(1)
                .endX(0)
                .endY(0)
                .stops(new Stop(0, Color.rgb(111, 246, 3)),
                new Stop(1, Color.rgb(54, 128, 5)))
                .build() // green button);
                ).build();
        slideLock4.setScaleX(0.7);
        slideLock4.setScaleY(0.7);
        // Image logo = new Image("prviekranpozadina.jpg");
        Image logo = new Image("proba.jpg");
        ImageView slika = new ImageView();
        slika.setImage(logo);

        Image pjesaciSlika = new Image("pjesaci.gif");
        ImageView slika2 = new ImageView();
        slika2.setScaleX(0.3);
        slika2.setScaleY(0.3);
        slika2.setLayoutX(350);
        slika2.setLayoutY(-50);
        slika2.setImage(pjesaciSlika);


        Text pocetnoP = TextBuilder.create()
                .text("Simulacija semafora")
                // .id("aplikacija")
                .layoutX(180)
                .fill(Color.web("#635551"))
                .font(Font.font("ArialBlack", FontWeight.BOLD, 52))
                .layoutY(10)
                .textOrigin(VPos.TOP)
                .build();

        Blend blend = new Blend();
        blend.setMode(BlendMode.MULTIPLY);

        DropShadow ds = new DropShadow();
        ds.setColor(Color.rgb(254, 235, 66, 0.3));
        ds.setOffsetX(5);
        ds.setOffsetY(5);
        ds.setRadius(5);
        ds.setSpread(0.2);

        blend.setBottomInput(ds);

        DropShadow ds1 = new DropShadow();
        ds1.setColor(Color.web("#f13a00"));
        ds1.setRadius(20);
        ds1.setSpread(0.2);

        Blend blend2 = new Blend();
        blend2.setMode(BlendMode.MULTIPLY);

        InnerShadow is = new InnerShadow();
        is.setColor(Color.web("#feeb42"));
        is.setRadius(9);
        is.setChoke(0.8);
        blend2.setBottomInput(is);

        InnerShadow is1 = new InnerShadow();
        is.setColor(Color.web("#f13a00"));
        is.setRadius(5);
        is.setChoke(0.4);
        blend2.setTopInput(is1);

        Blend blend1 = new Blend();
        blend1.setMode(BlendMode.MULTIPLY);
        blend1.setBottomInput(ds1);
        blend1.setTopInput(blend2);

        blend.setTopInput(blend1);
        pocetnoP.setEffect(blend);


        Text ime = TextBuilder.create()
                .text("Nikola Srdoč")
                .layoutX(200)
                .id("welcome-text")
                .layoutY(200)
                .textOrigin(VPos.TOP)
                .build();

        final Group root = new Group();
        final Scene pocetni = new Scene(root);

        pocetni.getStylesheets().add(GlavnaKlasa.class.getResource("Buttons.css").toExternalForm());
        root.getChildren().addAll(slika, slideLock4, pocetnoP, ime, slika2);
        ScenicView.show(scene);   // za gui builder_________________________________________________


        //  pocetni.start(stage);
        // stage.setScene(scene);       //   za   glavni prozor_____________________________________
        stage.setScene(pocetni);  //za iphone lock screen______________________________________________
        //

        stage.setResizable(false);
        stage.show();

        scene.setOnMouseClicked(new EventHandler<MouseEvent>() {
            public void handle(MouseEvent me) {
                  // showOnConsole("Mouse moved, x: " + me.getX() + ", y: " + me.getY() );
                 System.out.println("X: "+(me.getSceneX()-330)+"Y: "+(me.getSceneY()-170));  //skaliran je semafor, pa mu je pomaknuta pocetna tocka u koordinatnom sistemu
                 System.out.println(" getx: "+  me.getX()+"gety: "+me.getY());
               // transition.play();
            }
        });

        slideLock4.lockedProperty().addListener(new ChangeListener<Boolean>() {
            @Override
            public void changed(ObservableValue<? extends Boolean> observable, Boolean oldValue, Boolean newValue) {
                if (!newValue) {

                    //stage.close();
                    //    stage.
                    // stage.setScene(scene);
                    //  new FlipInYTransition(grupa_elementi_aplikacije).play();

                    //stage.show();

                    //stage.setScene(scene);
                    //  stage.show();
                    // ____________________________________________________________Prelazak iz jednog u drugi izbornik__________________           
                    Timeline animacijaizbornika = new Timeline();
                    animacijaizbornika.setCycleCount(1);

                    KeyFrame prviProzor = new KeyFrame(Duration.seconds(0),
                            new EventHandler<ActionEvent>() {
                                public void handle(ActionEvent event) {
                                    new FlipOutYTransition(root).play();      //  trebalo bi sve ubacit u metodu, ima primjer pri kraju
                               
                                }
                            });
                    KeyFrame drugiProzor = new KeyFrame(Duration.seconds(2),
                            new EventHandler<ActionEvent>() {
                                public void handle(ActionEvent event) {

                                    //pocetni.equals(scene);
                                    //  new FlipOutYTransition(root).stop();
                                    stage.setScene(scene);
                             applyAnimation(grupa_elementi_aplikacije);
                            
                            //    Circle krug = new Circle(20, 20, 15);
                             ///  grupa_elementi_aplikacije.getChildren().add(krug);
                               
                                    
                                    
                                    new FlipInYTransition(scene.getRoot()).play();      //  trebalo bi sve ubacit u metodu, ima primjer pri kraju
                            
                                
                                
                             
                               
                               
                   
                               
                               
                                }
                            });
                    KeyFrame zadnji = new KeyFrame(Duration.seconds(4),
                            new EventHandler<ActionEvent>() {
                                public void handle(ActionEvent event) {
                                    // stage.close();
                                    // stage.show();
                                }
                            });

                    animacijaizbornika.getKeyFrames().addAll(prviProzor, drugiProzor, zadnji);
                    animacijaizbornika.play();

                    //stage.show();

                }
                // System.out.println(newValue);
            }
        });
        // ____________________________________________________________end  Prelazak iz jednog u drugi izbornik__________________     

        izradilistuAnimacija(grupa_elementi_aplikacije);


        grupa_elementi_aplikacije.getChildren().add(dodajListenere(semafori));

        //  zatvorenostBind.addListener(listenerPromjene);


        bindingSemafora.removeListener(listenerPromjeneSemafora);

        otvorenostBind.removeListener(listenerPromjene);
        otvorenostBind.setValue(listaOtvorenosti.get(0));
        zatvorenostBind.setValue(listaZatvorenosti.get(0));
        otvorenostBind.addListener(listenerPromjene);
        bindingSemafora.addListener(listenerPromjeneSemafora);

        bindingSemafora.bindBidirectional(odabirBind);
    }

    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    private Boolean pali() {
        Boolean status = true;
        return status;
    }

    private Boolean gasi() {
        Boolean status = false;
        return status;
    }

//_______________________________________________________________________________________________________________
    private Group dodajListenere(final Group grupa) // dodavanje listenera na semafore  nakon što se odabere custom mod
    {
        // for (int i = 0; i < grupa.getChildren().size(); i++) {
        for (int i = 0; i < 5; i++) {
            final int brojac = i;
            grupa.getChildren().get(i).setOnMouseClicked(new EventHandler<MouseEvent>() {
                public void handle(MouseEvent me) {
                    bindingSemafora.set(Integer.parseInt(grupa.getChildren().get(brojac).getId()));



                }
            });
        }
        return grupa;
    }

    private void podesavanjeSemaforaZadnje(int pozicijaSemafora) {
        // Duration otvoreno = Duration.seconds(otvorenostBind.get());
        // Duration zatvoreno = Duration.seconds(zatvorenostBind.get());





        final Timeline animacijaSemafora = new Timeline();
        animacijaSemafora.setCycleCount(Timeline.INDEFINITE);
      //  animacijaSemafora.getKeyFrames().addListener(null);
       
   
        
           
          // animacijaSemafora.getKeyFrames().addListener(invalidationListener);
         //  System.out.println("tralalal");
           
           
           
        int otvoreno;
        int zatvoreno;
        final int pozicija = pozicijaSemafora;
       // KeyFrame test= new KeyFrame
        if (pocetno == true) {
            otvoreno = listaOtvorenosti.get(pozicija);
            zatvoreno = listaZatvorenosti.get(pozicija);
        } else {
            otvoreno = otvorenostBind.get();
            zatvoreno = zatvorenostBind.get();

        }
        if (pozicija < 4) {

            KeyFrame zeleno = new KeyFrame(Duration.ZERO, new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowBlinking(false);
                    listaSemafora.get(pozicija).setGreenOn(true);

 
                }
            });

            KeyFrame zuto = new KeyFrame(vrijeme(otvoreno), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(true);

                    listaSemafora.get(pozicija).setGreenOn(false);


                }
            });
            KeyFrame crveno = new KeyFrame(vrijeme(otvoreno + 2), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setRedOn(true);
                    listaSemafora.get(pozicija).setYellowOn(false);
                    if (pozicija == 3) {
                        if (iskljuciPjesake == true) {
                            listaSkretaca.get(0).setGreenOn(true);


                        }
                    }

                }
            });
            KeyFrame skretac = new KeyFrame(vrijeme(otvoreno + zatvoreno), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    if (pozicija == 3) {
                        if (iskljuciPjesake == true) {
                            listaSkretaca.get(1).setGreenOn(true);
                            listaSkretaca.get(2).setGreenOn(true);
                        }
                    }

                }
            });
            KeyFrame skretacNoviList = new KeyFrame(vrijeme(otvoreno + zatvoreno), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    if (pozicija == 3) {

                        listaSkretaca.get(0).setGreenOn(false);


                    }

                }
            });

            KeyFrame zutoCrvenoPocetak = new KeyFrame(vrijeme(otvoreno + 2 + zatvoreno), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(true);

                }
            });
            KeyFrame zutoCrvenoKraj = new KeyFrame(vrijeme(otvoreno + 2 + zatvoreno + 1), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(false);
                    listaSemafora.get(pozicija).setRedOn(false);
                    listaSemafora.get(pozicija).setYellowOn(false);
                    if (pozicija == 3) {

                        listaSkretaca.get(1).setGreenOn(false);
                        listaSkretaca.get(2).setGreenOn(false);
                    }

                }
            });

            animacijaSemafora.getKeyFrames().addAll(zeleno, zuto, crveno, skretacNoviList, skretac, zutoCrvenoPocetak, zutoCrvenoKraj);
        }
        if (pozicija == 4) {

            KeyFrame pocetno4 = new KeyFrame(vrijeme(0), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setRedOn(true);//za prvi put kad se pokrene animacija da bude crveno
                    listaSemafora.get(pozicija).setYellowBlinking(false);

                    listaPjesaka.get(pozicija - 1).setRedOn(true);
                    listaPjesaka.get(pozicija - 2).setRedOn(true);
                    listaPjesaka.get(pozicija - 3).setRedOn(true);
                    listaPjesaka.get(pozicija - 4).setRedOn(true);

                    if (iskljuciPjesake == false) {
                        listaPjesaka.get(pozicija - 1).setRedOn(false);
                        listaPjesaka.get(pozicija - 1).setGreenOn(true);
                        listaPjesaka.get(pozicija - 2).setRedOn(false);
                        listaPjesaka.get(pozicija - 2).setGreenOn(true);
                        iskljuciPjesake = true;
                    }
                }
            });
            KeyFrame pjesaciStop = new KeyFrame(vrijeme(zatvoreno), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                }
            });
            KeyFrame zutoCrvenoPocetak = new KeyFrame(vrijeme(zatvoreno + 1), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(true);

                    listaPjesaka.get(pozicija - 1).setGreenOn(false);
                    listaPjesaka.get(pozicija - 1).setRedOn(true);
                    listaPjesaka.get(pozicija - 2).setGreenOn(false);
                    listaPjesaka.get(pozicija - 2).setRedOn(true);
                }
            });
            KeyFrame zutoCrvenoKraj = new KeyFrame(vrijeme(zatvoreno + 2), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(false);
                    listaSemafora.get(pozicija).setRedOn(false);
                    listaSemafora.get(pozicija).setGreenOn(true);
                }
            });
            KeyFrame zeleno = new KeyFrame(vrijeme(zatvoreno + otvoreno + 2), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setGreenOn(false);
                    listaSemafora.get(pozicija).setYellowOn(true);
                }
            });

            KeyFrame zuto = new KeyFrame(vrijeme(zatvoreno + otvoreno + 4), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                    listaSemafora.get(pozicija).setYellowOn(false);
                    listaSemafora.get(pozicija).setRedOn(true);
                }
            });
            KeyFrame crveno = new KeyFrame(listaAnimacija.get(1).getCycleDuration(), new EventHandler<ActionEvent>() {
                @Override
                public void handle(ActionEvent event) {
                }
            });

            animacijaSemafora.getKeyFrames().addAll(pocetno4, pjesaciStop, zeleno, zuto, crveno, zutoCrvenoPocetak, zutoCrvenoKraj);

        }

        listaAnimacija.add(pozicija, animacijaSemafora);


    }

    private void izradilistuAnimacija(final Group grupa) {

        for (int i = 0; i < 5; i++) {
            podesavanjeSemaforaZadnje(i);
            listaAnimacija.get(i).playFrom(Duration.seconds(-1));//ako stavimo od pocetka ne uhvati parametre definirane u nultoj sekundi

        }
        
      

       
      referentnoVrijeme =    TimelineBuilder.create()
    .keyFrames(
      new KeyFrame(
       new Duration(100),// listaAnimacija.get(1).getCycleDuration(),   //  umjesto new Duration(10)
        new EventHandler<ActionEvent>() {
          public void handle(javafx.event.ActionEvent t) {
     //     System.out.println("test");
          
          checkForCollision(grupa);
    //     System.out.println( grupa.getChildren().size());
         
         
          }
        }
      )
    )  .cycleCount(Timeline.INDEFINITE)
             
    .build();
        
      
        
        
     
        referentnoVrijeme.play();
        
         
     /*   KeyFrame ref = new KeyFrame(listaAnimacija.get(1).getCycleDuration(), new EventHandler<ActionEvent>() {
            public void handle(ActionEvent event) {
                  System.out.println("listaAnimacija.get(1).getCycleDuration():"+listaAnimacija.get(1).getCycleDuration());
            }
        });
        referentnoVrijeme.getKeyFrames().add(ref);
        referentnoVrijeme.setCycleCount(Timeline.INDEFINITE);
        referentnoVrijeme.play();
        */
        
        
    }

    private Duration vrijeme(int sekunde) {
        Duration vrijeme = Duration.seconds(sekunde);
           
        return vrijeme;
     
    }

    private void stopOdabranog(int pozicija) {
        listaSemafora.get(pozicija).setGreenOn(false);
        listaSemafora.get(pozicija).setYellowOn(false);
        listaSemafora.get(pozicija).setRedOn(false);
    }

    private void sviStop() {

        if (listaAnimacija.isEmpty() == false) {

            for (int i = 0; i < listaAnimacija.size(); i++) {
                listaAnimacija.get(i).stop();

                listaSemafora.get(i).setGreenOn(false);
                listaSemafora.get(i).setYellowOn(false);
                listaSemafora.get(i).setRedOn(false);
                if (i < 4) {
                    listaPjesaka.get(i).setGreenOn(false);
                    listaPjesaka.get(i).setRedOn(false);
                    if (i < 3) {
                        listaSkretaca.get(i).setGreenOn(false);
                    }
                }

            }
        } else {
            for (int i = 0; i < listaSemafora.size(); i++) {
                listaSemafora.get(i).setYellowBlinking(false);
            }
        }

        listaAnimacija.clear();
    }

    private void treptanje() {
        for (int i = 0; i < listaSemafora.size(); i++) {
            listaSemafora.get(i).setYellowBlinking(true);
        }
    }
    
    
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
     
       put.getElements().add(new LineTo(582,470 ));
       
       
        put.getElements().add(new MoveTo(0,73) );
        put.getElements().add(new LineTo(64,128) );
        put.getElements().add(new LineTo(441,136) );
        put.getElements().add(new LineTo(637,101) );
        put.getElements().add(new LineTo(891,47) );
       

     
 
      
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
      pathTransition.setDuration(Duration.seconds(4.0));
     // pathTransition.setDelay(Duration.seconds(2.0));
      pathTransition.setPath(path);
      pathTransition.setNode(shape);
      pathTransition.setOrientation(PathTransition.OrientationType.ORTHOGONAL_TO_TANGENT);
      pathTransition.setCycleCount(Timeline.INDEFINITE);
     // pathTransition.setAutoReverse(true);
     //pathTransition.getNode().
       Line linija = new Line(547, 357, 511, 412);
       
       
        EventHandler handler =     new EventHandler<ActionEvent>() {
                                public void handle(ActionEvent event) {
                                       //  trebalo bi sve ubacit u metodu, ima primjer pri kraju
                               System.out.println("fgdfg");
                                }       
        };
       linija.addEventHandler(EventType.ROOT, handler);
               
        final ChangeListener listenerPromjenePrihvati = new ChangeListener() {
            @Override
            public void changed(ObservableValue observableValue, Object oldValue, Object newValue) {
                System.out.println("oldvalue:" + oldValue);
                System.out.println("newvalue:" + newValue);
            }
        };
               
               
      // checkForCollision((Rectangle)shape, linija);
       
            //  System.out.println(shape.getTranslateX());
      return pathTransition;
   }

   /**
    * Determine the path's opacity based on command-line argument if supplied
    * or zero by default if no numeric value provided.
    * 
    * @return Opacity to use for path.
    */
  private double determinePathOpacity()
   {
      final Parameters params = getParameters();
      final List<String> parameters = params.getRaw();
      double pathOpacity = 0.0;
      if (!parameters.isEmpty())
      {
         try
         {
            pathOpacity = Double.valueOf(parameters.get(0));
         }
         catch (NumberFormatException nfe)
         {
            pathOpacity = 0.0;
         }
      }
      return pathOpacity;
   }

   /**
    * Apply animation, the subject of this class.
    * 
    * @param group Group to which animation is applied.
    */
   private void applyAnimation(final Group group)
   {
     
      final Path path =putGore(determinePathOpacity());
      group.getChildren().add(path);
       Rectangle pravo = new Rectangle(20,20);
       group.getChildren().add(pravo);
        pravo.setFill(Color.RED);
       Line linija = new Line(547, 357, 511, 412);
       linija.setVisible(false);
       group.getChildren().add(linija);
        
        Rectangle pravo2 = new Rectangle(20,20);
        
       // group.getChildren().add(pravo2);
        pravo2.setFill(Color.WHITE);
      
      
          Rectangle pravo3 = new Rectangle(20,20);
      //  group.getChildren().add(pravo3);
        pravo3.setFill(Color.BLUE);
      //  checkForCollision(pravo,linija);
        
        
      
       // final PathTransition transition = generatePathTransition(pravo, path);
   //   final PathTransition  transition = generatePathTransition(pravo, path);
       transition = generatePathTransition(pravo, path);
  final PathTransition transition2=  generatePathTransition(pravo2, path);

  
   final PathTransition transition3=  generatePathTransition(pravo3, path);
  
  
  
  
//transition2.setDelay(Duration.millis(250));
    // transition.playFrom(Duration.millis(4500));
      transition.play(); 
   //  transition2.play();
    //  transition3.setDelay(Duration.millis(350));
     // transition3.play();
    
   // transition.setDelay(Duration.millis(2500));
   // transition.pause();
   //  transition.play(); 
   System.out.println( transition.getNode().getTransforms());
   System.out.println( transition.getNode().getTranslateX());
   System.out.println(pravo.getTranslateX());
  
   
  // transition.
   }
                                 
      
   private void checkForCollision(Group grupa)
   {
  
  //timeline.getKeyFrames().get(0).
       
        if (listaSemafora.get(0).redOnProperty().getValue())
        {
       if(grupa.getChildren().get(8).getBoundsInParent().intersects(grupa.getChildren().get(9).getBoundsInParent()))
       
       {
         
            transition.pause();
           
   
    
       }
        }
        else
        {
        transition.play();
        }
   }
    
    
    

    public static void main(String[] args) {

        Application.launch(args);
        //System.out.println(System.getProperty("java.classpath"));
    }
}
